import Link from "next/link";
import { Suspense } from "react";
import { QuestLog } from "@/components/quest-log";
import { nexonImagesEnabled } from "@/lib/images";
import { getClassifiedPost } from "@/lib/pipeline";
import { listTrackedPosts } from "@/lib/scraper/nexon";
import type { ClassifiedPost, PostSummary } from "@/lib/types";

export default function Home(props: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <LeafIcon />
        <div>
          <h1 className="font-pixel text-3xl leading-none text-wood-dark sm:text-4xl">
            Lazy Tracker
          </h1>
          <p className="mt-1 text-sm font-bold text-wood-dark">
            Play less. Miss nothing. Your GMS patch to-do list.
          </p>
        </div>
      </header>

      <main>
        <Suspense fallback={<Notice title="Loading">Reading the patch notes...</Notice>}>
          <Tracker searchParams={props.searchParams} />
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

type LoadResult =
  | { ok: true; post: ClassifiedPost; recent: PostSummary[] }
  | { ok: false; message: string };

async function load(id: string | undefined): Promise<LoadResult> {
  try {
    const [post, tracked] = await Promise.all([getClassifiedPost(id), listTrackedPosts()]);
    const showImages = nexonImagesEnabled();
    const recent = tracked
      .slice(0, 8)
      .map((summary) => (showImages ? summary : { ...summary, thumbnailUrl: null }));
    return { ok: true, post, recent };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function Tracker({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { id } = await searchParams;
  const result = await load(typeof id === "string" && /^\d+$/.test(id) ? id : undefined);

  if (!result.ok) {
    return (
      <Notice title="Quest failed">
        <span role="alert">Could not load the tracker: {result.message}</span>
      </Notice>
    );
  }

  return (
    <div className="grid gap-5">
      <QuestLog post={result.post} />

      <section className="panel">
        <h2 className="panel-title">Notice Board</h2>
        <ul className="panel-body grid gap-3 text-sm sm:grid-cols-2">
          {result.recent.map((summary) => (
            <li key={summary.sourceId}>
              <Link href={`/?id=${summary.sourceId}`} className="notice">
                {summary.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={summary.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>
                  <span className="font-bold underline">{summary.title}</span>{" "}
                  <span className="chip chip-quiet">{summary.kind}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
