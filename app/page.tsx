import { Suspense } from "react";
import { QuestLog } from "@/components/quest-log";
import { getOngoing } from "@/lib/tracker";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <LeafIcon />
        <div>
          <h1 className="font-pixel text-3xl leading-none text-wood-dark sm:text-4xl">
            Lazy Tracker
          </h1>
          <p className="mt-1 text-sm font-bold text-wood-dark">
            Play less. Miss nothing. Everything worth doing in GMS right now.
          </p>
        </div>
      </header>

      <main>
        <Suspense fallback={<Notice title="Loading">Checking what is running...</Notice>}>
          <Tracker />
        </Suspense>
      </main>

      <footer className="mt-8 text-center text-xs font-bold text-wood-dark">
        Fan project, not affiliated with Nexon. Tiers and time estimates are AI-generated from the
        official patch notes and can be wrong. MapleStory and all related images belong to Nexon.
      </footer>
    </div>
  );
}

// Original pixel art: an 8x8 leaf drawn as rows of rectangles.
function LeafIcon() {
  const rows: [number, number, number][] = [
    [3, 0, 2],
    [1, 1, 1],
    [3, 1, 2],
    [6, 1, 1],
    [1, 2, 6],
    [0, 3, 8],
    [1, 4, 6],
    [2, 5, 4],
    [3, 6, 2],
  ];
  return (
    <svg viewBox="0 0 8 8" className="h-12 w-12 shrink-0" shapeRendering="crispEdges" aria-hidden>
      {rows.map(([x, y, width]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={width} height={1} fill="#d8501a" />
      ))}
      <rect x={3} y={7} width={1} height={1} fill="#4e2f14" />
    </svg>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      <p className="panel-body">{children}</p>
    </section>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Reads the store on every request, inside <Suspense>, so the page shell is
// sent at once and the list streams in. No AI call ever happens here.
async function Tracker() {
  const { items, sources, updatedAt } = await getOngoing();

  if (items.length === 0) {
    return (
      <Notice title="Nothing to show">
        No ongoing events are stored yet. Run the ingest step to fetch and classify the latest
        posts.
      </Notice>
    );
  }

  return (
    <div className="grid gap-5">
      <QuestLog items={items} updated={updatedAt ? formatDay(updatedAt) : null} />

      <section className="panel">
        <h2 className="panel-title">Sources</h2>
        <div className="panel-body">
          <p className="mb-3 text-sm">The official posts this list was built from:</p>
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {sources.map((source) => (
              <li key={source.sourceId}>
                <a href={source.url} target="_blank" rel="noreferrer" className="notice">
                  {source.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={source.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <span>
                    <span className="font-bold underline">{source.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {formatDay(source.publishedAt)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
