import type { Metadata } from "next";
import Link from "next/link";
import { PixelSprite } from "@/components/pixel-sprite";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getArchive, type ArchiveEntry } from "@/lib/tracker";

// The folder name is the URL: app/archive/page.tsx is served at /archive.

export const metadata: Metadata = {
  title: "Archive | Lazy Tracker",
  description: "Every Global MapleStory patch and event notice Lazy Tracker has sorted.",
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function PostRow({ post }: { post: ArchiveEntry }) {
  return (
    <li>
      <Link href={`/archive/${post.sourceId}`} className="notice notice-row">
        {post.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        )}
        <span className="grid min-w-0 gap-1">
          <span className="font-bold">{post.title}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-soft">
            <span>{formatDay(post.publishedAt)}</span>
            <span className="chip chip-quiet">
              {post.itemCount} {post.itemCount === 1 ? "quest" : "quests"}
            </span>
            {post.newsCount > 0 && (
              <span className="chip chip-quiet">
                {post.newsCount} {post.newsCount === 1 ? "change" : "changes"}
              </span>
            )}
            {post.ongoingCount > 0 && (
              <span className="chip chip-live">{post.ongoingCount} still running</span>
            )}
          </span>
        </span>
        <span className="notice-arrow" aria-hidden="true">
          ▸
        </span>
      </Link>
    </li>
  );
}

// An async Server Component: it runs on the server only, so it can await the
// data directly. No AI call happens here; getArchive() reads the cached store.
export default async function ArchivePage() {
  const posts = await getArchive();
  const patches = posts.filter((post) => post.kind === "patch");
  const events = posts.filter((post) => post.kind === "event");

  return (
    <div className="page">
      <Scenery />
      <SiteHeader current="/archive" />

      <main className="grid gap-4 sm:gap-5">
        <h1 className="sr-only">Archive</h1>
        {posts.length === 0 ? (
          <section className="window">
            <h2 className="window-title">Archive</h2>
            <div className="window-body">
              <div className="empty">
                <PixelSprite name="chest" className="empty-sprite" />
                <p className="empty-title">The archive is empty</p>
                <p>Nothing has been sorted yet. Posts appear here after the daily check.</p>
                <p>
                  <Link href="/" className="btn btn-go">
                    Back to the Quest Log
                  </Link>
                </p>
              </div>
            </div>
          </section>
        ) : (
          <p className="page-intro">
            <PixelSprite name="chest" className="h-6 w-7 shrink-0" />
            <span>
              Every patch and event notice sorted so far. Open one to see all its quests, ended
              ones included.
            </span>
          </p>
        )}

        {patches.length > 0 && (
          <section className="window">
            <h2 className="window-title">
              Patch Notes
              <span className="window-note">{patches.length} stored</span>
            </h2>
            <ul className="window-body grid gap-2 text-sm">
              {patches.map((post) => (
                <PostRow key={post.sourceId} post={post} />
              ))}
            </ul>
          </section>
        )}

        {events.length > 0 && (
          <section className="window">
            <h2 className="window-title">
              Event Notices
              <span className="window-note">{events.length} stored</span>
            </h2>
            <ul className="window-body grid gap-2 text-sm sm:grid-cols-2">
              {events.map((post) => (
                <PostRow key={post.sourceId} post={post} />
              ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
