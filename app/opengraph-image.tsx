import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The picture shown when the site's link is pasted into Discord, X and the
// like. Next.js renders this JSX to a PNG at build time, so there is no image
// file to maintain. Only a small subset of CSS works here (flexbox, no grid).

export const alt = "Lazy Tracker: play less, miss nothing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The maple leaf from components/pixel-sprite.tsx, drawn as squares.
const LEAF = [
  "....o.....",
  "...ooo....",
  ".o.ooo.o..",
  ".ooooooo..",
  "ooooooooo.",
  ".ooooooo..",
  "..ooooo...",
  "...ooo....",
  "....b.....",
  "....b.....",
];

export default function OpenGraphImage() {
  const pixel = 26;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          background: "linear-gradient(#4fb0f3, #a9defd 60%, #86d85f 60%, #58b530)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {LEAF.map((row, y) => (
            <div key={y} style={{ display: "flex" }}>
              {[...row].map((cell, x) => (
                <div
                  key={x}
                  style={{
                    width: pixel,
                    height: pixel,
                    background: cell === "o" ? "#f2711c" : cell === "b" ? "#7a3a10" : "transparent",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 112,
              fontWeight: 800,
              color: "#ffa51f",
              textShadow: "0 8px 0 #16224a, 4px 0 #fff, -4px 0 #fff, 0 4px #fff, 0 -4px #fff",
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "10px 28px",
              borderRadius: 999,
              background: "#ffffff",
              color: "#1d2b55",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            Play less. Miss nothing.
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#16224a" }}>
            What is worth doing in MapleStory right now
          </div>
        </div>
      </div>
    ),
    size,
  );
}
