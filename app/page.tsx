import Link from "next/link";
import { Suspense } from "react";
import { PROFILES } from "@/lib/classifier/schema";
import { getClassifiedPost } from "@/lib/pipeline";
import { listTrackedPosts } from "@/lib/scraper/nexon";
import type { ClassifiedPost, PostSummary } from "@/lib/types";

// Phase 1 preview: plain markup on purpose. The quest-log UI arrives in Phase 3.
export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Lazy Tracker</h1>
      <p className="mb-6 text-sm">Phase 1 preview: scrape, classify, show raw results.</p>
      <Suspense fallback={<p>Reading the patch notes. The first load can take a minute.</p>}>
        <Preview searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type LoadResult =
  | { ok: true; post: ClassifiedPost; recent: PostSummary[] }
  | { ok: false; message: string };

async function load(id: string | undefined): Promise<LoadResult> {
  try {
    const [post, tracked] = await Promise.all([getClassifiedPost(id), listTrackedPosts()]);
    return { ok: true, post, recent: tracked.slice(0, 12) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "-";
}

async function Preview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { id } = await searchParams;
  const result = await load(typeof id === "string" && /^\d+$/.test(id) ? id : undefined);

  if (!result.ok) {
    return <p role="alert">Could not load the tracker: {result.message}</p>;
  }
  const { post, recent } = result;

  return (
    <>
      <h2 className="text-xl font-semibold">{post.title}</h2>
      <p className="mb-4 text-sm">
        {post.kind} · published {formatDate(post.publishedAt)} · {post.items.length} items ·{" "}
        {post.model} · <a href={post.url}>source</a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Item</th>
              {PROFILES.map((profile) => (
                <th key={profile} className="p-2">
                  {profile}
                </th>
              ))}
              <th className="p-2">Ends</th>
              <th className="p-2">Rewards</th>
              <th className="p-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {post.items.map((item) => (
              <tr key={item.id} className="border-b align-top">
                <td className="p-2">
                  <strong>{item.title}</strong>
                  <br />
                  {item.summary}
                </td>
                {PROFILES.map((profile) => (
                  <td key={profile} className="p-2 whitespace-nowrap">
                    {item.tiers[profile]}
                  </td>
                ))}
                <td className="p-2 whitespace-nowrap">{formatDate(item.endsAt)}</td>
                <td className="p-2">{item.rewards.join(", ") || "-"}</td>
                <td className="p-2">{item.timeEstimate?.label ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Other recent posts</h2>
      <ul className="list-disc pl-6 text-sm">
        {recent.map((summary) => (
          <li key={summary.sourceId}>
            <Link href={`/?id=${summary.sourceId}`}>{summary.title}</Link> ({summary.kind})
          </li>
        ))}
      </ul>
    </>
  );
}
