import Link from "next/link";
import { Suspense } from "react";
import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import { getClassifiedPost } from "@/lib/pipeline";
import { listTrackedPosts } from "@/lib/scraper/nexon";
import { resolveTier } from "@/lib/tiering";
import type { ClassifiedPost, PostSummary, Priority, Profile } from "@/lib/types";

// Phase 1 preview: plain markup on purpose. The quest-log UI arrives in Phase 3.
export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-7xl p-6">
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

interface View {
  id?: string;
  profile: Profile;
  focus: Priority[];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseView(params: Record<string, string | string[] | undefined>): View {
  const id = first(params.id);
  const profile = first(params.profile);
  const focus = (first(params.focus) ?? "").split(",");
  return {
    id: id && /^\d+$/.test(id) ? id : undefined,
    profile: PROFILES.find((candidate) => candidate === profile) ?? "casual",
    focus: PRIORITIES.filter((priority) => focus.includes(priority)),
  };
}

function hrefFor(view: View): string {
  const query = new URLSearchParams();
  if (view.id) query.set("id", view.id);
  query.set("profile", view.profile);
  if (view.focus.length > 0) query.set("focus", view.focus.join(","));
  return `/?${query}`;
}

function toggle(focus: Priority[], priority: Priority): Priority[] {
  return focus.includes(priority)
    ? focus.filter((active) => active !== priority)
    : [...focus, priority];
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "-";
}

async function Preview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const view = parseView(await searchParams);
  const result = await load(view.id);

  if (!result.ok) {
    return <p role="alert">Could not load the tracker: {result.message}</p>;
  }
  const { post, recent } = result;

  return (
    <>
      <h2 className="text-xl font-semibold">{post.title}</h2>
      <p className="mb-4 text-sm">
        {post.kind} · published {formatDate(post.publishedAt)} · {post.items.length} items ·{" "}
        {post.model} · prompt v{post.promptVersion} · <a href={post.url}>source</a>
      </p>

      <p className="text-sm">
        Profile:{" "}
        {PROFILES.map((profile) => (
          <Link
            key={profile}
            href={hrefFor({ ...view, profile })}
            className={`mr-3 ${profile === view.profile ? "font-bold underline" : ""}`}
          >
            {profile}
          </Link>
        ))}
      </p>
      <p className="mb-4 text-sm">
        I care about:{" "}
        {PRIORITIES.map((priority) => (
          <Link
            key={priority}
            href={hrefFor({ ...view, focus: toggle(view.focus, priority) })}
            className={`mr-3 ${view.focus.includes(priority) ? "font-bold underline" : ""}`}
          >
            {priority}
          </Link>
        ))}
        {view.focus.length === 0 && "(none picked, so all three count)"}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Item</th>
              <th className="p-2">Your tier</th>
              <th className="p-2">Progression</th>
              <th className="p-2">Limited</th>
              <th className="p-2">Cosmetic</th>
              <th className="p-2">Ends</th>
              <th className="p-2">Rewards</th>
              <th className="p-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {post.items.map((item) => (
              <tr key={item.id} className="border-b align-top">
                <td className="p-2">
                  <strong>{item.title}</strong> [{item.category}]
                  <br />
                  {item.summary}
                </td>
                <td className="p-2 font-bold whitespace-nowrap">
                  {resolveTier(item, view.profile, view.focus)}
                </td>
                <td className="p-2 whitespace-nowrap">{item.value.progression[view.profile]}</td>
                <td className="p-2 whitespace-nowrap">{item.value.limited}</td>
                <td className="p-2 whitespace-nowrap">{item.value.cosmetic}</td>
                <td className="p-2 whitespace-nowrap">{formatDate(item.endsAt)}</td>
                <td className="p-2">{item.rewards.join(", ") || "-"}</td>
                <td className="p-2">
                  {item.timeEstimate
                    ? `${item.timeEstimate.label} (${item.timeEstimate.basis})`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Other recent posts</h2>
      <ul className="list-disc pl-6 text-sm">
        {recent.map((summary) => (
          <li key={summary.sourceId}>
            <Link href={hrefFor({ ...view, id: summary.sourceId })}>{summary.title}</Link> (
            {summary.kind})
          </li>
        ))}
      </ul>
    </>
  );
}
