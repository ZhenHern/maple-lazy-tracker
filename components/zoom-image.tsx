"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";

/** Largest side of the hover preview, in pixels. */
const POP_SIZE = 352;
/** Space kept between the preview, the thumbnail and the edge of the screen. */
const POP_GAP = 12;
/** Below this much free width beside the thumbnail, no hover preview is shown. */
const POP_MIN = 200;

interface ZoomImageProps {
  src: string;
  alt: string;
  className: string;
  /** Heading of the lightbox: the quest or the reward the picture belongs to. */
  title?: string;
  /** Every picture the lightbox can step through. Defaults to just this one. */
  group?: string[];
  /** Small game icons are enlarged with hard pixel edges instead of blurring. */
  pixelated?: boolean;
  /**
   * Hover preview only, no lightbox. For thumbnails inside the quest header,
   * where a click already opens the quest.
   */
  hoverOnly?: boolean;
}

interface PopPlace {
  top: number;
  left?: number;
  right?: number;
  width: number;
  height: number;
}

// Where the hover preview goes: beside the thumbnail, on whichever side has
// room, and never off the top or bottom of the screen.
function placePop(rect: DOMRect): PopPlace | null {
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  const roomRight = viewWidth - rect.right - POP_GAP * 2;
  const roomLeft = rect.left - POP_GAP * 2;
  if (Math.max(roomRight, roomLeft) < POP_MIN) return null;
  const onRight = roomRight >= POP_SIZE || roomRight >= roomLeft;
  const height = Math.min(POP_SIZE, viewHeight - POP_GAP * 2);
  const middle = rect.top + rect.height / 2;
  return {
    top: Math.min(Math.max(middle, height / 2 + POP_GAP), viewHeight - height / 2 - POP_GAP),
    width: Math.min(POP_SIZE, onRight ? roomRight : roomLeft),
    height,
    ...(onRight ? { left: rect.right + POP_GAP } : { right: viewWidth - rect.left + POP_GAP }),
  };
}

// Images load straight from Nexon's CDN in the visitor's browser. next/image is
// avoided on purpose: it would copy and re-serve them from our own server.
export function ZoomImage({
  src,
  alt,
  className,
  title,
  group,
  pixelated = false,
  hoverOnly = false,
}: ZoomImageProps) {
  const [pop, setPop] = useState<PopPlace | null>(null);
  const [open, setOpen] = useState(false);

  // The preview is pinned to the screen, so it would drift away from its
  // thumbnail when the page scrolls. Hide it instead.
  useEffect(() => {
    if (!pop) return;
    const hide = () => setPop(null);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [pop]);

  const hover = {
    // Touch screens have no hover; there a tap opens the lightbox.
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") setPop(placePop(event.currentTarget.getBoundingClientRect()));
    },
    onPointerLeave: () => setPop(null),
  };

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
  );

  return (
    <>
      {hoverOnly ? (
        <span className={className} {...hover}>
          {image}
        </span>
      ) : (
        <button
          type="button"
          className={`zoom ${className}`}
          aria-label={`Enlarge picture: ${alt || title || "image"}`}
          onClick={() => {
            setPop(null);
            setOpen(true);
          }}
          {...hover}
        >
          {image}
        </button>
      )}

      {pop &&
        // A portal draws the preview at the end of <body>, so the quest card's
        // "overflow: hidden" cannot clip it.
        createPortal(
          <span
            className={`zoom-pop ${pixelated ? "zoom-pixel" : ""}`}
            style={
              {
                top: pop.top,
                left: pop.left,
                right: pop.right,
                "--pop-w": `${pop.width}px`,
                "--pop-h": `${pop.height}px`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" referrerPolicy="no-referrer" />
          </span>,
          document.body,
        )}

      {open && (
        <Lightbox
          images={group?.includes(src) ? group : [src]}
          start={src}
          title={title ?? alt}
          pixelated={pixelated}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface LightboxProps {
  images: string[];
  start: string;
  title: string;
  pixelated: boolean;
  onClose: () => void;
}

// The enlarged picture, in a native <dialog>: the browser supplies the
// backdrop, the Esc key, the focus trap and returning focus to the thumbnail.
function Lightbox({ images, start, title, pixelated, onClose }: LightboxProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, images.indexOf(start)));
  const many = images.length > 1;
  const src = images[index];

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const step = (by: number) => setIndex((index + by + images.length) % images.length);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!many) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  };

  return (
    <dialog
      ref={dialog}
      className="lightbox window"
      aria-label={title}
      onClose={onClose}
      onKeyDown={onKeyDown}
      // The dialog element itself is only hit by a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="lightbox-frame">
        <div className="window-title">
          <span className="lightbox-name">{title}</span>
          {many && (
            <span className="window-note">
              {index + 1} / {images.length}
            </span>
          )}
        </div>

        <div className={`lightbox-stage ${pixelated ? "zoom-pixel" : ""}`}>
          {/* The key remounts the image, so the previous picture does not
              linger while the next one loads. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt={title} referrerPolicy="no-referrer" />
        </div>

        <div className="lightbox-foot">
          {many && (
            <span className="flex gap-2">
              <button type="button" className="btn" onClick={() => step(-1)} aria-label="Previous picture">
                ◀
              </button>
              <button type="button" className="btn" onClick={() => step(1)} aria-label="Next picture">
                ▶
              </button>
            </span>
          )}
          <a href={src} target="_blank" rel="noreferrer" className="lightbox-link">
            Open original
          </a>
          <button type="button" className="btn btn-go" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
