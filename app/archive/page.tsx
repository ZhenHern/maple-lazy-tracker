import type { Metadata } from "next";
import Link from "next/link";
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
      <Link href={`/archive/${post.sourceId}`} className="notice">
        {post.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        )}
        <span className="grid gap-1">
          <span className="font-bold underline">{post.title}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            <span className="chip chip-quiet">{post.kind === "patch" ? "Patch notes" : "Event"}</span>
            {formatDay(post.publishedAt)}
            <span>
              · {post.itemCount} {post.itemCount === 1 ? "quest" : "quests"}
              {post.ongoingCount > 0 && `, ${post.ongoingCount} still running`}
            </span>
          </span>
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
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 sm:pt-10">
      <Scenery />
      <SiteHeader current="/archive" />

      <main className="grid gap-5">
        <h1 className="sr-only">Archive</h1>
        {posts.length === 0 && (
          <section className="window">
            <h2 className="window-title">Archive</h2>
            <p className="window-body">Nothing has been stored yet.</p>
          </section>
        )}

        {patches.length > 0 && (
          <section className="window">
            <h2 className="window-title">Patch Notes</h2>
            <ul className="window-body grid gap-2 text-sm">
              {patches.map((post) => (
                <PostRow key={post.sourceId} post={post} />
              ))}
            </ul>
          </section>
        )}

        {events.length > 0 && (
          <section className="window">
            <h2 className="window-title">Event Notices</h2>
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
