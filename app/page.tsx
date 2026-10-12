import { Suspense } from "react";
import { PixelSprite } from "@/components/pixel-sprite";
import { QuestLog } from "@/components/quest-log";
import { Scenery } from "@/components/scenery";
import { getOngoing } from "@/lib/tracker";

export default function Home() {
  return (
    // The bottom padding leaves room for the status bar pinned to the screen.
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-28 sm:pt-10">
      <Scenery />

      <header className="mb-6 flex items-center gap-3">
        <PixelSprite name="leaf" className="logo-leaf h-14 w-14 shrink-0" />
        <div>
          <h1 className="logo text-4xl leading-none sm:text-5xl">Lazy Tracker</h1>
          <p className="tagline">Play less. Miss nothing.</p>
        </div>
      </header>

      <main>
        <Suspense fallback={<Notice title="Loading">Checking what is running...</Notice>}>
          <Tracker />
        </Suspense>
      </main>

      <footer className="footnote">
        Fan project, not affiliated with Nexon. Tiers and time estimates are AI-generated from the
        official patch notes and can be wrong. MapleStory and all related images belong to Nexon.
      </footer>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="window">
      <h2 className="window-title">{title}</h2>
      <p className="window-body">{children}</p>
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

      <section className="window">
        <h2 className="window-title">Notice Board</h2>
        <div className="window-body">
          <p className="mb-3 text-sm">The official posts this list was built from:</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
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
