import { PixelSprite, type SpriteName } from "./pixel-sprite";

interface JobChangeBannerProps {
  /** Counts job changes. Zero shows nothing; each new value plays the banner again. */
  stamp: number;
  name: string;
  sprite: SpriteName;
}

/**
 * A small "CLASS CHANGE" toast, shown when the visitor picks another job. It
 * fades itself out in CSS (.job-change in globals.css), so there is no timer to
 * clean up. With reduced motion the banner never becomes visible.
 */
export function JobChangeBanner({ stamp, name, sprite }: JobChangeBannerProps) {
  if (stamp === 0) return null;
  return (
    // The key remounts the banner on every change, which restarts its animation.
    <div key={stamp} className="job-change" role="status">
      <PixelSprite name={sprite} className="h-8 w-8 shrink-0" />
      <span className="job-change-text">
        <small>CLASS CHANGE</small>
        <strong>{name}</strong>
      </span>
    </div>
  );
}
