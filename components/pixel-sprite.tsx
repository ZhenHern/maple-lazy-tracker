// Original pixel art, drawn as text grids: each character is one pixel and maps
// to a colour in the sprite's palette ("." is transparent). Rendering them as
// inline SVG means no image files and no art copied from the game.
interface Sprite {
  rows: string[];
  palette: Record<string, string>;
}

const sprites = {
  shroom: {
    rows: [
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
    ],
    palette: { k: "#5a2d0c", o: "#f58a1f", w: "#ffd9a0", c: "#fff1d6", e: "#1d2b55", p: "#ff9aa2" },
  },
  leaf: {
    rows: [
      "...ll...",
      ".l.ll.l.",
      ".llllll.",
      "llllllll",
      ".llllll.",
      "..llll..",
      "...ll...",
      "...s....",
    ],
    palette: { l: "#e8501a", s: "#7a3a10" },
  },
  bulb: {
    rows: [
      "..yyyy..",
      ".yyyyyy.",
      "yywyyyyy",
      "yywyyyyy",
      "yyyyyyyy",
      ".yyyyyy.",
      "..yyyy..",
      "..gggg..",
      "..gggg..",
      "...gg...",
    ],
    palette: { y: "#ffc531", w: "#fff6c9", g: "#7d879c" },
  },
  sprout: {
    rows: [
      "........",
      ".gg..gg.",
      "gggggggg",
      ".gggggg.",
      "...gg...",
      "...gg...",
      ".bbbbbb.",
      "..bbbb..",
    ],
    palette: { g: "#58b530", b: "#a8642a" },
  },
  cup: {
    rows: [
      "..s..s..",
      "...s..s.",
      "cccccc..",
      "cccccccc",
      "cccccc.c",
      "cccccccc",
      ".cccc...",
      "cccccc..",
    ],
    palette: { s: "#9aa7c4", c: "#3b62c4" },
  },
  sword: {
    rows: [
      "......ss",
      ".....sss",
      "....sss.",
      "g..sss..",
      ".gsss...",
      "..gs....",
      ".h.g....",
      "h...g...",
    ],
    palette: { s: "#8fa0c0", g: "#e0a100", h: "#7a3a10" },
  },
  door: {
    rows: [
      ".bbbbbb.",
      "bddddddb",
      "bddddddb",
      "bdddddyb",
      "bddddddb",
      "bddddddb",
      "bddddddb",
      "bbbbbbbb",
    ],
    palette: { b: "#5a2d0c", d: "#c9853c", y: "#ffc531" },
  },
  arrow: {
    rows: [
      "...aa...",
      "..aaaa..",
      ".aaaaaa.",
      "aaaaaaaa",
      "..aaaa..",
      "..aaaa..",
      "..aaaa..",
      "..aaaa..",
    ],
    palette: { a: "#3fa41c" },
  },
  hourglass: {
    rows: [
      "hhhhhhhh",
      ".hssssh.",
      "..hssh..",
      "...hh...",
      "...hh...",
      "..h..h..",
      ".hssssh.",
      "hhhhhhhh",
    ],
    palette: { h: "#7a3a10", s: "#ffc531" },
  },
  hat: {
    rows: [
      "........",
      "..kkkk..",
      "..kkkk..",
      "..kkkk..",
      "..rrrr..",
      "..kkkk..",
      "kkkkkkkk",
      "........",
    ],
    palette: { k: "#3a2a5c", r: "#d12c43" },
  },
} satisfies Record<string, Sprite>;

export type SpriteName = keyof typeof sprites;

interface PixelSpriteProps {
  name: SpriteName;
  className?: string;
}

export function PixelSprite({ name, className }: PixelSpriteProps) {
  const { rows, palette }: Sprite = sprites[name];
  return (
    <svg
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[cell]} />
          ),
        ),
      )}
    </svg>
  );
}
