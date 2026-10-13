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
  chest: {
    rows: [
      ".kkkkkkkk.",
      "kbbbbbbbbk",
      "kbwbbbbbbk",
      "kkkkyykkkk",
      "kbbbyybbbk",
      "kbbbbbbbbk",
      "kbbbbbbbbk",
      "kkkkkkkkkk",
    ],
    palette: { k: "#5a2d0c", b: "#c9853c", w: "#f0c58a", y: "#ffc531" },
  },
  // The sprites below stand in for a reward that has no picture: one per kind
  // of reward (see lib/reward-kind.ts).
  coin: {
    rows: [
      "..kkkk..",
      ".kyyyyk.",
      "kywyyyyk",
      "kywyyyyk",
      "kyyyyyyk",
      "kyyyyyyk",
      ".kyyyyk.",
      "..kkkk..",
    ],
    palette: { k: "#a86a00", y: "#ffc531", w: "#fff6c9" },
  },
  gem: {
    rows: [
      "..bbbb..",
      ".bwwbbb.",
      "bwwbbbbd",
      "bbbbbbdd",
      ".bbbbdd.",
      "..bbdd..",
      "...bd...",
      "........",
    ],
    palette: { b: "#3fa0e8", w: "#c9ecff", d: "#1b6fc2" },
  },
  scroll: {
    rows: [
      "kkkkkkkk",
      ".pppppp.",
      ".pkkkkp.",
      ".pppppp.",
      ".pkkkpp.",
      ".pppppp.",
      "kkkkkkkk",
      "........",
    ],
    palette: { k: "#7a3a10", p: "#fff1d6" },
  },
  potion: {
    rows: [
      "...cc...",
      "..gggg..",
      "...gg...",
      "..grrg..",
      ".grwrrg.",
      ".grrrrg.",
      ".grrrrg.",
      "..gggg..",
    ],
    palette: { c: "#a8642a", g: "#8fa0c0", r: "#d12c43", w: "#ffd0d6" },
  },
  ticket: {
    rows: [
      "........",
      "tttttttt",
      "tttwwttt",
      ".twwwwt.",
      ".twwwwt.",
      "tttwwttt",
      "tttttttt",
      "........",
    ],
    palette: { t: "#f2711c", w: "#fff1d6" },
  },
  chair: {
    rows: [
      ".bb.....",
      ".bb.....",
      ".bb.....",
      ".bbrrrr.",
      ".bbbbbb.",
      ".b....b.",
      ".b....b.",
      ".b....b.",
    ],
    palette: { b: "#a8642a", r: "#d12c43" },
  },
  paw: {
    rows: [
      "..p..p..",
      "p.p..p.p",
      "p......p",
      "..pppp..",
      ".pppppp.",
      ".pppppp.",
      "..pppp..",
      "........",
    ],
    palette: { p: "#a8642a" },
  },
  medal: {
    rows: [
      ".rr..rr.",
      ".rr..rr.",
      "..rrrr..",
      "..yyyy..",
      ".yywyyy.",
      ".ywyyyy.",
      ".yyyyyy.",
      "..yyyy..",
    ],
    palette: { r: "#d12c43", y: "#ffc531", w: "#fff6c9" },
  },
  spark: {
    rows: [
      "...y....",
      "...y....",
      "..yyy...",
      "yyywyyy.",
      "..yyy...",
      "...y..y.",
      "...y.yyy",
      "......y.",
    ],
    palette: { y: "#f2a400", w: "#fff6c9" },
  },
  gift: {
    rows: [
      "..y..y..",
      "...yy...",
      "rrryyrrr",
      "rrryyrrr",
      "yyyyyyyy",
      "rrryyrrr",
      "rrryyrrr",
      "rrryyrrr",
    ],
    palette: { r: "#d12c43", y: "#ffc531" },
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
