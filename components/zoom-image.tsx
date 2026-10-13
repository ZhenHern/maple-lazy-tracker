"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";

/** Largest hover preview, in pixels. Big screenshots are shrunk to fit this. */
const POP_MAX = { width: 480, height: 420 };
/** Largest picture in the lightbox, before the screen itself limits it. */
const BOX_MAX = { width: 960, height: 720 };
/** Small pictures are enlarged until their longer side is about this long. */
const POP_TARGET = 240;
const BOX_TARGET = 320;
/** ...but never by more than this, or they turn to mush. */
const MAX_GROW = 4;
/** Up to this size a picture is a game icon, enlarged with hard pixel edges. */
const ICON_SIDE = 64;
/** Space kept between the preview, the thumbnail and the edge of the screen. */
const GAP = 12;
/** Border plus padding of the preview's frame (see .zoom-pop in globals.css). */
const FRAME = 9;
/** The pointer must rest this long, so crossing the list does not flash previews. */
const HOVER_DELAY = 120;
/** A preview has to be at least this much larger than the thumbnail to be worth showing. */
const WORTH_IT = 1.2;

interface Size {
  width: number;
  height: number;
}

interface Shown extends Size {
  /** True for an enlarged game icon: keep its pixels sharp instead of blurring. */
  crisp: boolean;
}

// How large to draw a picture: its own size when that fits, shrunk when it is
// too big for the space, and enlarged a little when it is tiny.
function fitSize(natural: Size, max: Size, target: number): Shown {
  const longer = Math.max(natural.width, natural.height);
  const grow = Math.min(Math.max(target / longer, 1), MAX_GROW);
  const scale = Math.min(grow, max.width / natural.width, max.height / natural.height);
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
    crisp: scale > 1 && longer <= ICON_SIDE,
  };
}

interface Pop extends Shown {
  top: number;
  left: number;
}

// Where the hover preview goes: beside the thumbnail when there is room, else
// above or below it, else on top of it. Always fully on screen.
function placePop(frame: DOMRect, image: HTMLImageElement): Pop | null {
  // Not loaded yet, or broken: nothing to enlarge.
  if (!image.naturalWidth) return null;
  const view = { width: window.innerWidth, height: window.innerHeight };
  const edge = (GAP + FRAME) * 2;
  const size = fitSize(
    { width: image.naturalWidth, height: image.naturalHeight },
    {
      width: Math.min(POP_MAX.width, view.width - edge),
      height: Math.min(POP_MAX.height, view.height - edge),
    },
    POP_TARGET,
  );
  if (size.width < image.getBoundingClientRect().width * WORTH_IT) return null;

  const width = size.width + FRAME * 2;
  const height = size.height + FRAME * 2;
  const within = (value: number, room: number) => Math.max(GAP, Math.min(value, room - GAP));
  const centredTop = within(frame.top + frame.height / 2 - height / 2, view.height - height);
  const centredLeft = within(frame.left + frame.width / 2 - width / 2, view.width - width);

  if (frame.right + GAP + width + GAP <= view.width) {
    return { ...size, top: centredTop, left: frame.right + GAP };
  }
  if (frame.left - GAP - width >= GAP) {
    return { ...size, top: centredTop, left: frame.left - GAP - width };
  }
  if (frame.top - GAP - height >= GAP) {
    return { ...size, top: frame.top - GAP - height, left: centredLeft };
  }
  if (frame.bottom + GAP + height + GAP <= view.height) {
    return { ...size, top: frame.bottom + GAP, left: centredLeft };
  }
  return { ...size, top: centredTop, left: centredLeft };
}

interface ZoomImageProps {
  src: string;
  alt: string;
  className: string;
  /** Heading of the lightbox: the quest or the reward the picture belongs to. */
  title?: string;
  /** Every picture the lightbox can step through. Defaults to just this one. */
  group?: string[];
  /**
   * Hover preview only, no lightbox. For thumbnails inside the quest header,
   * where a click already opens the quest.
   */
  hoverOnly?: boolean;
}

// Images load straight from Nexon's CDN in the visitor's browser. next/image is
// avoided on purpose: it would copy and re-serve them from our own server.
export function ZoomImage({ src, alt, className, title, group, hoverOnly = false }: ZoomImageProps) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const hidePop = () => {
    window.clearTimeout(timer.current);
    setPop(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

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
      if (event.pointerType !== "mouse") return;
      const frame = event.currentTarget;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const image = frame.querySelector("img");
        if (image) setPop(placePop(frame.getBoundingClientRect(), image));
      }, HOVER_DELAY);
    },
    onPointerLeave: hidePop,
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
            hidePop();
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
            className={`zoom-pop ${pop.crisp ? "zoom-crisp" : ""}`}
            style={{ top: pop.top, left: pop.left }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              style={{ width: pop.width, height: pop.height }}
              referrerPolicy="no-referrer"
            />
          </span>,
          document.body,
        )}

      {open && (
        <Lightbox
          images={group?.includes(src) ? group : [src]}
          start={src}
          title={title ?? alt}
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
  onClose: () => void;
}

// The enlarged picture, in a native <dialog>: the browser supplies the
// backdrop, the Esc key, the focus trap and returning focus to the thumbnail.
function Lightbox({ images, start, title, onClose }: LightboxProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, images.indexOf(start)));
  // Known once the picture has loaded. Until then CSS keeps it on screen.
  const [shown, setShown] = useState<Shown | null>(null);
  const many = images.length > 1;
  const src = images[index];

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const step = (by: number) => {
    setShown(null);
    setIndex((index + by + images.length) % images.length);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!many) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  };

  // The whole picture always fits the window: never scrolled, never cropped.
  const measure = (image: HTMLImageElement) => {
    setShown(
      fitSize(
        { width: image.naturalWidth, height: image.naturalHeight },
        {
          // What is left of the window after the dialog's frame, title and buttons.
          width: Math.min(BOX_MAX.width, window.innerWidth - 60),
          height: Math.min(BOX_MAX.height, window.innerHeight - 190),
        },
        BOX_TARGET,
      ),
    );
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

        <div className={`lightbox-stage ${shown?.crisp ? "zoom-crisp" : ""}`}>
          {/* The key remounts the image, so the previous picture does not
              linger while the next one loads. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={title}
            style={shown ? { width: shown.width, height: shown.height } : undefined}
            referrerPolicy="no-referrer"
            onLoad={(event) => measure(event.currentTarget)}
          />
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
