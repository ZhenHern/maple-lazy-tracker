import { ImageResponse } from "next/og";

// The icon phones use when the site is added to the home screen. Browsers'
// tab icon is app/icon.svg; phones want a PNG, so Next.js renders this JSX to
// one at build time. It is the Lazy Shroom from components/pixel-sprite.tsx.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const SHROOM = [
  "....kkkkkk....",
  "..kkooooookk..",
  ".kowwooooowok.",
  "kowwwooooooook",
  "koowoooowwoook",
  "koooooooowwook",
  "kkooooooooookk",
  ".kkkkkkkkkkkk.",
  "..kcccccccck..",
  "..kcecccceck..",
  "..kpccccccpk..",
  "..kcccccccck..",
  "...kkkkkkkk...",
];
const PALETTE: Record<string, string> = {
  k: "#5a2d0c",
  o: "#f58a1f",
  w: "#ffd9a0",
  c: "#fff1d6",
  e: "#1d2b55",
  p: "#ff9aa2",
};

export default function AppleIcon() {
  const pixel = 10;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(#4fb0f3, #a9defd)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {SHROOM.map((row, y) => (
            <div key={y} style={{ display: "flex" }}>
              {[...row].map((cell, x) => (
                <div
                  key={x}
                  style={{ width: pixel, height: pixel, background: PALETTE[cell] ?? "transparent" }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
