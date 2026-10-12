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
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 sm:pt-10">
      <Scenery />
      <SiteHeader current="/archive" />

      <main>
        <section className="window">
          <h1 className="window-title">
            {post.kind === "patch" ? "Patch Notes" : "Event Notice"}
            <span className="window-note">Sorted {formatDay(classifiedAt)}</span>
          </h1>
          <div className="window-body grid gap-4">
            <div className="grid gap-1">
              <p className="text-lg font-extrabold">{post.title}</p>
              <p className="text-sm text-ink-soft">
                Published {formatDay(post.publishedAt)} ·{" "}
                <a href={post.url} target="_blank" rel="noreferrer" className="underline">
                  Read the official post
                </a>{" "}
                ·{" "}
                <Link href="/archive" className="underline">
                  Back to the archive
                </Link>
              </p>
            </div>

            <ArchiveLog items={items} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
