import { Suspense } from "react";
import { QuestLog } from "@/components/quest-log";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getOngoing } from "@/lib/tracker";

export default function Home() {
  return (
    // The bottom padding leaves room for the status bar pinned to the screen.
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-28 sm:pt-10">
      <Scenery />

      <SiteHeader current="/" />

      <main>
        <h1 className="sr-only">Lazy Tracker: what is worth doing in MapleStory right now</h1>
        <Suspense fallback={<Notice title="Loading">Checking what is running...</Notice>}>
          <Tracker />
        </Suspense>
      </main>

      <SiteFooter />
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

// Reads the cached list (see getOngoing). No AI call ever happens here: the
// daily cron does the classifying, visitors only ever read its results.
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
