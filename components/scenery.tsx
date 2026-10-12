import type { CSSProperties } from "react";
import { PixelSprite } from "./pixel-sprite";

// Fixed positions and timings (not random) so the server and the browser
// render exactly the same markup. "rest" is where a cloud sits when the
// visitor has asked for reduced motion.
const CLOUDS = [
  { top: "6%", scale: 1, speed: "95s", delay: "-10s", rest: "8%" },
  { top: "18%", scale: 0.7, speed: "130s", delay: "-70s", rest: "62%" },
  { top: "30%", scale: 0.85, speed: "110s", delay: "-45s", rest: "30%" },
  { top: "44%", scale: 0.55, speed: "150s", delay: "-120s", rest: "80%" },
];

const LEAVES = [
  { left: "6%", speed: "13s", delay: "-2s" },
  { left: "21%", speed: "17s", delay: "-9s" },
  { left: "38%", speed: "12s", delay: "-5s" },
  { left: "55%", speed: "19s", delay: "-14s" },
  { left: "71%", speed: "14s", delay: "-7s" },
  { left: "88%", speed: "16s", delay: "-11s" },
];

/** The backdrop behind every window: sky, clouds, hills and falling leaves. */
export function Scenery() {
  return (
    <div className="scenery" aria-hidden="true">
      {CLOUDS.map((cloud) => (
        <span
          key={cloud.top}
          className="cloud"
          style={
            {
              top: cloud.top,
              scale: cloud.scale,
              "--speed": cloud.speed,
              "--delay": cloud.delay,
              "--rest": cloud.rest,
            } as CSSProperties
          }
        />
      ))}
      <div className="hills" />
      {LEAVES.map((leaf) => (
        <span
          key={leaf.left}
          className="leaf-fall"
          style={{ left: leaf.left, "--speed": leaf.speed, "--delay": leaf.delay } as CSSProperties}
        >
          <PixelSprite name="leaf" className="w-full" />
        </span>
      ))}
    </div>
  );
}
