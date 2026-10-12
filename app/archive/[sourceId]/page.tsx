import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveLog } from "@/components/archive-log";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getArchive, getArchivedPost } from "@/lib/tracker";

// The square brackets make this a dynamic route: /archive/45393 renders this
// file with params.sourceId === "45393".

// Lists the ids to build ahead of time. A post stored later is rendered on its
// first visit and then kept, so the list does not need to be complete.
export async function generateStaticParams() {
  return (await getArchive()).map((post) => ({ sourceId: post.sourceId }));
}

export async function generateMetadata({
  params,
}: PageProps<"/archive/[sourceId]">): Promise<Metadata> {
  const { sourceId } = await params;
  const archived = await getArchivedPost(sourceId);
  return { title: archived ? `${archived.post.title} | Lazy Tracker` : "Not found | Lazy Tracker" };
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ArchivedPostPage({ params }: PageProps<"/archive/[sourceId]">) {
  // In Next 16 `params` is a Promise, so it is awaited before use.
  const { sourceId } = await params;
  const archived = await getArchivedPost(sourceId);
  // Renders the nearest not-found page with a 404 status.
  if (!archived) notFound();
  const { post, items, classifiedAt } = archived;

  return (
    <div className="page">
      <Scenery />
      <SiteHeader current="/archive" />

      <main className="grid gap-3">
        <p>
          <Link href="/archive" className="btn">
            ◂ Back to the archive
          </Link>
        </p>

        <section className="window">
          <p className="window-title">
            {post.kind === "patch" ? "Patch Notes" : "Event Notice"}
            <span className="window-note">Sorted {formatDay(classifiedAt)}</span>
          </p>
          <div className="window-body grid gap-4">
            <div className="post-head">
              {post.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbnailUrl} alt="" referrerPolicy="no-referrer" />
              )}
              <div className="grid min-w-0 gap-1.5">
                <h1 className="text-lg leading-tight font-extrabold">{post.title}</h1>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-soft">
                  <span>Published {formatDay(post.publishedAt)}</span>
                  <span className="chip chip-quiet">
                    {post.itemCount} {post.itemCount === 1 ? "quest" : "quests"}
                  </span>
                  {post.ongoingCount > 0 && (
                    <span className="chip chip-live">{post.ongoingCount} still running</span>
                  )}
                </p>
                <p>
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold underline"
                  >
                    Read the official post ↗
                  </a>
                </p>
              </div>
            </div>

            <ArchiveLog items={items} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
