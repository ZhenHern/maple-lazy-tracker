"use client";

import { useMemo } from "react";
import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import { resolveTier } from "@/lib/tiering";
import type { Priority, Profile, Tier, TrackerItem } from "@/lib/types";
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

// Soonest deadline first; items with no end date go last.
function byDeadline(a: TrackerItem, b: TrackerItem): number {
  return (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999");
}

interface QuestLogProps {
  items: TrackerItem[];
  /** Human-readable date the data was last refreshed, or null. */
  updated: string | null;
}

export function QuestLog({ items: allItems, updated }: QuestLogProps) {
  const [profile, setProfile] = useLocalStorage("lazy-tracker:profile", sanitizeProfile);
  const [priorities, setPriorities] = useLocalStorage(
    "lazy-tracker:priorities",
    sanitizePriorities,
  );
  const now = useNow();

  const groups = useMemo(() => {
    const grouped: Record<SectionKey, TrackerItem[]> = {
      must_do: [],
      if_free: [],
      skip: [],
      ended: [],
    };
    for (const item of [...allItems].sort(byDeadline)) {
      const ended = now !== null && item.endsAt !== null && Date.parse(item.endsAt) <= now;
      grouped[ended ? "ended" : resolveTier(item, profile, priorities)].push(item);
    }
    return grouped;
  }, [allItems, profile, priorities, now]);

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
        <h2 className="panel-title">Ongoing Now</h2>
        <div className="panel-body grid gap-4">
          <p className="text-sm">
            <span className="font-bold">{allItems.length} things are running right now</span>,
            gathered from the patch notes and every event notice.
            {updated && <span className="text-ink-soft"> Last checked {updated}.</span>}
          </p>

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
                      <QuestItem key={item.id} item={item} profile={profile} now={now} />
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
