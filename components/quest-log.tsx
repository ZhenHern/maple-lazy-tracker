"use client";

import { useMemo } from "react";
import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import { resolveTier } from "@/lib/tiering";
import type { ClassifiedPost, Priority, Profile, Tier, TrackerItem } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useNow } from "@/lib/use-now";
import { ProfilePicker } from "./profile-picker";
import { QuestItem } from "./quest-item";

type SectionKey = Tier | "ended";

const SECTIONS: { key: SectionKey; title: string; blurb: string; open: boolean }[] = [
  { key: "must_do", title: "Must Do", blurb: "Don't log off without these", open: true },
  { key: "if_free", title: "If Free", blurb: "Worth it when you have time", open: true },
  { key: "skip", title: "Skip", blurb: "Safe to ignore", open: false },
  { key: "ended", title: "Ended", blurb: "Already over", open: false },
];

// Stable sanitizers for useLocalStorage: stored data is untrusted input too.
function sanitizeProfile(stored: unknown): Profile {
  return PROFILES.find((profile) => profile === stored) ?? "casual";
}

function sanitizePriorities(stored: unknown): Priority[] {
  return Array.isArray(stored) ? PRIORITIES.filter((priority) => stored.includes(priority)) : [];
}

function sanitizeDone(stored: unknown): Record<string, true> {
  if (typeof stored !== "object" || stored === null) return {};
  return Object.fromEntries(
    Object.entries(stored)
      .filter(([, value]) => value === true)
      .map(([key]) => [key, true as const]),
  );
}

// Soonest deadline first; items with no end date go last.
function byDeadline(a: TrackerItem, b: TrackerItem): number {
  return (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999");
}

export function QuestLog({ post }: { post: ClassifiedPost }) {
  const [profile, setProfile] = useLocalStorage("lazy-tracker:profile", sanitizeProfile);
  const [priorities, setPriorities] = useLocalStorage(
    "lazy-tracker:priorities",
    sanitizePriorities,
  );
  const [done, setDone] = useLocalStorage("lazy-tracker:done:v1", sanitizeDone);
  const now = useNow();

  const groups = useMemo(() => {
    const grouped: Record<SectionKey, TrackerItem[]> = {
      must_do: [],
      if_free: [],
      skip: [],
      ended: [],
    };
    for (const item of [...post.items].sort(byDeadline)) {
      const ended = now !== null && item.endsAt !== null && Date.parse(item.endsAt) <= now;
      grouped[ended ? "ended" : resolveTier(item, profile, priorities)].push(item);
    }
    return grouped;
  }, [post.items, profile, priorities, now]);

  const doneKey = (item: TrackerItem) => `${post.sourceId}:${item.id}`;

  function toggle(item: TrackerItem) {
    const key = doneKey(item);
    const next = { ...done };
    if (next[key]) delete next[key];
    else next[key] = true;
    setDone(next);
  }

  const mustDoTotal = groups.must_do.length;
  const mustDoDone = groups.must_do.filter((item) => done[doneKey(item)]).length;
  const percent = mustDoTotal === 0 ? 100 : Math.round((mustDoDone / mustDoTotal) * 100);

  return (
    <div className="grid gap-5">
      <section className="panel" aria-label="Your settings">
        <h2 className="panel-title">Your Character</h2>
        <div className="panel-body">
          <ProfilePicker
            profile={profile}
            priorities={priorities}
            onProfileChange={setProfile}
            onPrioritiesChange={setPriorities}
          />
        </div>
      </section>

      <section className="panel" aria-label="Quest log">
        <h2 className="panel-title">Quest Log</h2>
        <div className="panel-body grid gap-4">
          <div>
            <p className="text-sm">
              <a href={post.url} className="font-bold underline" target="_blank" rel="noreferrer">
                {post.title}
              </a>
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="label mb-0 shrink-0">Must-do progress</span>
              <div
                className="exp-bar"
                role="progressbar"
                aria-label="Must-do quests completed"
                aria-valuemin={0}
                aria-valuemax={mustDoTotal}
                aria-valuenow={mustDoDone}
              >
                <div className="exp-fill" style={{ width: `${percent}%` }} />
                <span className="exp-text">
                  {mustDoDone} / {mustDoTotal}
                </span>
              </div>
            </div>
          </div>

          {SECTIONS.map(({ key, title, blurb, open }) => {
            const items = groups[key];
            if (key === "ended" && items.length === 0) return null;
            return (
              <details key={key} className={`tier tier-${key}`} open={open}>
                <summary className="tier-head">
                  <span className="tier-name">{title}</span>
                  <span className="tier-blurb">{blurb}</span>
                  <span className="tier-count">{items.length}</span>
                </summary>
                {items.length === 0 ? (
                  <p className="p-3 text-sm text-ink-soft">
                    {key === "must_do"
                      ? "Nothing urgent for you this patch. Enjoy the free time!"
                      : "Nothing here."}
                  </p>
                ) : (
                  <ul className="grid gap-2 p-2">
                    {items.map((item) => (
                      <QuestItem
                        key={item.id}
                        item={item}
                        profile={profile}
                        done={Boolean(done[doneKey(item)])}
                        onToggle={() => toggle(item)}
                        now={now}
                      />
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
