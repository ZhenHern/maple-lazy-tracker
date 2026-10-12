"use client";

import { useMemo, useRef, useState } from "react";
import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import { resolveTier } from "@/lib/tiering";
import type { Priority, Profile, Tier, TrackerItem } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useNow } from "@/lib/use-now";
import { ENDING_SOON, formatRemaining } from "./countdown";
import { NpcDialog } from "./npc-dialog";
import { PROFILE_INFO, ProfilePicker } from "./profile-picker";
import { QuestItem } from "./quest-item";
import { StatusBar } from "./status-bar";

type SectionKey = Tier | "ended";
type CategoryFilter = TrackerItem["category"] | "all";

const SECTIONS: { key: SectionKey; title: string; blurb: string; empty: string }[] = [
  {
    key: "must_do",
    title: "Must Do",
    blurb: "Don't log off without these.",
    empty: "Nothing urgent for you right now. Enjoy the free time!",
  },
  {
    key: "if_free",
    title: "If Free",
    blurb: "Worth it when you have time.",
    empty: "Nothing optional right now.",
  },
  { key: "skip", title: "Skip", blurb: "Safe to ignore.", empty: "Nothing to skip. Wow." },
  { key: "ended", title: "Ended", blurb: "Already over.", empty: "Nothing has ended yet." },
];

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "event", label: "Events" },
  { key: "content", label: "New content" },
  { key: "system", label: "System" },
];

// Stable sanitizers for useLocalStorage: stored data is untrusted input too.
export function sanitizeProfile(stored: unknown): Profile {
  return PROFILES.find((profile) => profile === stored) ?? "casual";
}

function sanitizePriorities(stored: unknown): Priority[] {
  return Array.isArray(stored) ? PRIORITIES.filter((priority) => stored.includes(priority)) : [];
}

// Soonest deadline first; items with no end date go last.
function byDeadline(a: TrackerItem, b: TrackerItem): number {
  return (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999");
}

function matches(item: TrackerItem, query: string, category: CategoryFilter): boolean {
  if (category !== "all" && item.category !== category) return false;
  if (query === "") return true;
  const haystack = [item.title, item.summary, ...item.rewards].join(" ").toLowerCase();
  return haystack.includes(query);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
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
  const [tab, setTab] = useState<SectionKey>("must_do");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const logRef = useRef<HTMLElement>(null);

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

  const job = PROFILE_INFO[profile];

  const npcLines = useMemo(() => {
    const must = groups.must_do.length;
    const lines = [
      `Hey there, ${job.name}! ${plural(allItems.length, "thing")} are running in Maple World, ` +
        `but only ${must} ${must === 1 ? "is a Must Do" : "are Must Do"} for you. I sorted the rest so you can slack off.`,
    ];
    if (now !== null) {
      const dated = [...groups.must_do, ...groups.if_free]
        .filter((item) => item.endsAt !== null)
        .sort(byDeadline);
      const soon = dated.filter((item) => Date.parse(item.endsAt!) - now < ENDING_SOON).length;
      const [soonest] = dated;
      if (soonest) {
        lines.push(
          `"${soonest.title}" ends first: ${formatRemaining(Date.parse(soonest.endsAt!) - now)}.` +
            (soon > 1 ? ` ${soon} quests worth doing end within 3 days, so hurry!` : ""),
        );
      }
    }
    lines.push(
      `I marked ${plural(groups.skip.length, "thing")} as Skip. That is time back for napping.`,
      "Change your job or what you care about below, and I'll re-sort every quest on the spot.",
    );
    return lines;
  }, [allItems.length, groups, job.name, now]);

  function showTab(next: SectionKey) {
    setTab(next);
    logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Arrow keys move between tabs, the standard keyboard pattern for a tab list.
  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = tabs.findIndex((each) => each === document.activeElement);
    const next = tabs[(current + step + tabs.length) % tabs.length];
    next.focus();
    next.click();
  }

  const section = SECTIONS.find((each) => each.key === tab)!;
  const query = search.trim().toLowerCase();
  const visible = groups[tab].filter((item) => matches(item, query, category));
  const filtering = query !== "" || category !== "all";

  return (
    <div className="grid gap-5">
      <NpcDialog lines={npcLines} onShowMustDo={() => showTab("must_do")} />

      <section className="window" aria-label="Your settings">
        <h2 className="window-title">Your Character</h2>
        <div className="window-body">
          <ProfilePicker
            profile={profile}
            priorities={priorities}
            onProfileChange={setProfile}
            onPrioritiesChange={setPriorities}
          />
        </div>
      </section>

      <section className="window scroll-mt-4" aria-label="Quest log" ref={logRef}>
        <h2 className="window-title">
          Quest Log
          {updated && <span className="window-note">Last checked {updated}</span>}
        </h2>
        <div className="window-body grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <input
              type="search"
              className="search"
              placeholder="Search quests or rewards..."
              aria-label="Search quests or rewards"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              {CATEGORIES.map((each) => (
                <button
                  key={each.key}
                  type="button"
                  className="filter"
                  aria-pressed={category === each.key}
                  onClick={() => setCategory(each.key)}
                >
                  {each.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="tabs" role="tablist" aria-label="Tiers" onKeyDown={onTabKeyDown}>
              {SECTIONS.map(({ key, title }) => {
                if (key === "ended" && groups.ended.length === 0) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`tab-${key}`}
                    className={`tab tier-${key}`}
                    aria-selected={tab === key}
                    aria-controls="quest-panel"
                    tabIndex={tab === key ? 0 : -1}
                    onClick={() => setTab(key)}
                  >
                    {title}
                    <span className="tab-count">{groups[key].length}</span>
                  </button>
                );
              })}
            </div>

            <div
              id="quest-panel"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              className={`tab-panel tier-${tab}`}
            >
              <p className="mb-2 text-sm font-bold">
                {section.blurb}{" "}
                <span className="font-normal text-ink-soft">
                  {filtering
                    ? `Showing ${visible.length} of ${groups[tab].length}.`
                    : "Click a quest to open it."}
                </span>
              </p>

              {visible.length === 0 ? (
                <p className="empty">
                  {filtering && groups[tab].length > 0
                    ? "No quests match your search in this tab."
                    : section.empty}
                </p>
              ) : (
                // The key remounts the list on a tab change so quests animate in.
                <ul key={tab} className="grid gap-2">
                  {visible.map((item, index) => (
                    <QuestItem key={item.id} item={item} profile={profile} now={now} index={index} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      <StatusBar
        job={job}
        counts={{
          must_do: groups.must_do.length,
          if_free: groups.if_free.length,
          skip: groups.skip.length,
        }}
        active={tab}
        onSelect={showTab}
      />
    </div>
  );
}
