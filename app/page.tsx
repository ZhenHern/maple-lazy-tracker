import Link from "next/link";
import { Suspense } from "react";
import { PixelSprite } from "@/components/pixel-sprite";
import { QuestLog } from "@/components/quest-log";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getOngoing } from "@/lib/tracker";

export default function Home() {
  return (
    // "page-with-statusbar" leaves room for the status bar pinned to the screen.
    <div className="page page-with-statusbar">
      <Scenery />

      <SiteHeader current="/" />

      <main>
        <h1 className="sr-only">Lazy Tracker: what is worth doing in MapleStory right now</h1>
        <Suspense fallback={<Loading />}>
          <Tracker />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}

// Shown while the cached list is being read: the same windows as the real page,
// with grey bars where the quests will be, so nothing jumps when they arrive.
function Loading() {
  return (
    <div className="grid gap-4 sm:gap-5" role="status">
      <section className="window">
        <div className="npc">
          <span className="npc-sprite">
            <span className="bob">
              <PixelSprite name="shroom" className="w-16 sm:w-24" />
            </span>
            <span className="npc-name">Lazy Shroom</span>
          </span>
          <p className="npc-text">Hold on, I am reading the notice board for you...</p>
        </div>
      </section>

      <section className="window" aria-hidden="true">
        <h2 className="window-title">Quest Log</h2>
        <div className="window-body grid gap-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="skeleton" />
          ))}
        </div>
      </section>
    </div>
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
  const { items, news, sources, updatedAt, builtAt } = await getOngoing();

  if (items.length === 0) {
    return (
      <section className="window">
        <h2 className="window-title">Quest Log</h2>
        <div className="window-body">
          <div className="empty">
            <PixelSprite name="shroom" className="empty-sprite" />
            <p className="empty-title">The notice board is empty</p>
            <p>
              No ongoing events are stored yet. The list fills itself once a day, so check back
              soon, or browse what was sorted before.
            </p>
            <p>
              <Link href="/archive" className="btn btn-go">
                Open the archive
              </Link>
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-4 sm:gap-5">
      <QuestLog
        items={items}
        updated={updatedAt ? formatDay(updatedAt) : null}
        builtAt={builtAt}
      />

      {/* Changes with no deadline are news, not tasks, so they get no tier. */}
      {news.length > 0 && (
        <section className="window">
          <h2 className="window-title">
            What changed this patch
            <span className="window-note">Nothing to do, just good to know</span>
          </h2>
          <ul className="window-body news-list">
            {news.map((entry) => (
              <li key={entry.id}>
                <span className="news-title">
                  {entry.title}
                  <span className="chip chip-quiet">
                    {entry.category === "system" ? "System change" : "Permanent content"}
                  </span>
                </span>
                <span className="news-text">{entry.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="window">
        <h2 className="window-title">
          Notice Board
          <Link href="/archive" className="window-note underline">
            All sorted posts
          </Link>
        </h2>
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
