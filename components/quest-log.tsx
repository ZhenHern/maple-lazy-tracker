"use client";

import { useMemo, useRef, useState } from "react";
import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import {
  DEFAULT_PLAYTIME,
  planDay,
  plannedMinutes,
  PLAYTIMES,
  type Playtime,
} from "@/lib/tiering";
import type { Priority, Profile, Tier, TrackerItem } from "@/lib/types";
import { usePreviousVisit } from "@/lib/use-last-visit";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useNow } from "@/lib/use-now";
import { ENDING_SOON, formatRemaining } from "./countdown";
import { NpcDialog } from "./npc-dialog";
import { PixelSprite, type SpriteName } from "./pixel-sprite";
import { PROFILE_INFO, ProfilePicker } from "./profile-picker";
import { QuestItem } from "./quest-item";
import { StatusBar } from "./status-bar";

type SectionKey = Tier | "soon" | "ended";
type CategoryFilter = TrackerItem["category"] | "all";

interface Section {
  key: SectionKey;
  title: string;
  blurb: string;
  /** Shown when the tab has no quests at all: a headline, a line and a sprite. */
  empty: { title: string; text: string; sprite: SpriteName };
}

const SECTIONS: Section[] = [
  {
    key: "must_do",
    title: "Must Do",
    blurb: "Don't log off without these.",
    empty: {
      title: "Nothing urgent!",
      text: "No Must Do quests for this job right now. Enjoy the free time.",
      sprite: "shroom",
    },
  },
  {
    key: "if_free",
    title: "If Free",
    blurb: "Worth it when you have time.",
    empty: {
      title: "Nothing optional",
      text: "Every quest is either a Must Do or a Skip for this job.",
      sprite: "cup",
    },
  },
  {
    key: "skip",
    title: "Skip",
    blurb: "Safe to ignore.",
    empty: {
      title: "Nothing to skip. Wow.",
      text: "Everything running right now is worth at least a look.",
      sprite: "chest",
    },
  },
  {
    key: "soon",
    title: "Soon",
    blurb: "Not open yet. Nothing to do today.",
    empty: {
      title: "Nothing on the way",
      text: "Every announced quest has already opened.",
      sprite: "hourglass",
    },
  },
  {
    key: "ended",
    title: "Ended",
    blurb: "Already over.",
    empty: {
      title: "Nothing has ended yet",
      text: "Quests land here when their timer runs out.",
      sprite: "hourglass",
    },
  },
];

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "event", label: "Events" },
  { key: "content", label: "New content" },
];

// Stable sanitizers for useLocalStorage: stored data is untrusted input too.
export function sanitizeProfile(stored: unknown): Profile {
  return PROFILES.find((profile) => profile === stored) ?? "casual";
}

function sanitizePlaytime(stored: unknown): Playtime {
  return PLAYTIMES.find((playtime) => playtime === stored) ?? DEFAULT_PLAYTIME;
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

// Smooth scrolling is motion too, so it is skipped for visitors who ask for less.
function scrollToTop(element: HTMLElement | null) {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
}

/**
 * True when most of the list was rated by a backup model. The list then shows
 * one notice (RoughNotice) and hides the per-quest "Rough rating" chips, which
 * would otherwise sit on nearly every card.
 */
export function mostlyRough(items: TrackerItem[]): boolean {
  const rough = items.filter((item) => item.source.rating === "backup").length;
  return rough > 0 && rough * 2 > items.length;
}

export function RoughNotice({ items }: { items: TrackerItem[] }) {
  const rough = items.filter((item) => item.source.rating === "backup").length;
  return (
    <p className="rough-notice" role="note">
      <PixelSprite name="bulb" className="h-6 w-5 shrink-0" />
      <span>
        <strong>Rough ratings today.</strong>{" "}
        A backup AI sorted {rough === items.length ? "these quests" : `${rough} of these ${items.length} quests`}{" "}
        while the main one is out of quota. They re-rate automatically.
      </span>
    </p>
  );
}

interface QuestLogProps {
  items: TrackerItem[];
  /** Human-readable date the data was last refreshed, or null. */
  updated: string | null;
  /** When the server built the list, in ms. Stands in for the clock until it is known. */
  builtAt: number;
}

export function QuestLog({ items: allItems, updated, builtAt }: QuestLogProps) {
  const [profile, setProfile] = useLocalStorage("lazy-tracker:profile", sanitizeProfile);
  const [priorities, setPriorities] = useLocalStorage(
    "lazy-tracker:priorities",
    sanitizePriorities,
  );
  const [playtime, setPlaytime] = useLocalStorage("lazy-tracker:playtime", sanitizePlaytime);
  const clock = useNow();
  // The browser's clock is unknown during server rendering and hydration. The
  // time the list was built is close enough to decide what has opened or
  // ended, and it is the same on both sides, so the first render matches.
  const now = clock ?? builtAt;
  const previousVisit = usePreviousVisit();
  const [tab, setTab] = useState<SectionKey>("must_do");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const logRef = useRef<HTMLElement>(null);
  const pickerRef = useRef<HTMLElement>(null);

  // Ended quests take no part in the day's plan.
  const running = useMemo(
    () =>
      allItems.filter((item) => !(item.endsAt !== null && Date.parse(item.endsAt) <= now)),
    [allItems, now],
  );
  // The tier of every running quest for this player and this much playtime.
  const plans = useMemo(
    () => planDay(running, profile, priorities, playtime, now),
    [running, profile, priorities, playtime, now],
  );

  const groups = useMemo(() => {
    const grouped: Record<SectionKey, TrackerItem[]> = {
      must_do: [],
      if_free: [],
      skip: [],
      soon: [],
      ended: [],
    };
    for (const item of [...allItems].sort(byDeadline)) {
      const plan = plans.get(item.id);
      grouped[!plan ? "ended" : plan.note === "soon" ? "soon" : plan.tier].push(item);
    }
    return grouped;
  }, [allItems, plans]);

  const job = PROFILE_INFO[profile];
  const rough = useMemo(() => mostlyRough(allItems), [allItems]);

  const npcLines = useMemo(() => {
    const must = groups.must_do.length;
    const minutes = plannedMinutes(running, plans);
    const lines = [
      `Hey there, ${job.name}! ${plural(allItems.length, "thing")} are running in Maple World, ` +
        `but only ${must} ${must === 1 ? "is a Must Do" : "are Must Do"} for you. I sorted the rest so you can slack off.`,
      playtime === 0
        ? `Your Must Do list is about ${minutes} minutes a day. You set no time limit, so nothing was cut.`
        : `Your Must Do list is about ${minutes} minutes a day, inside the ${playtime} you gave me. One-minute claims are always in.`,
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
  }, [allItems.length, groups, job.name, now, running, plans, playtime]);

  function showTab(next: SectionKey) {
    setTab(next);
    scrollToTop(logRef.current);
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
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
  const filtering = query !== "" || category !== "all";
  // What each tab holds after the search and type filter. While filtering, the
  // tab counts show these, so a search points at the tab that has the matches.
  const shown = useMemo(() => {
    const filtered = {} as Record<SectionKey, TrackerItem[]>;
    for (const { key } of SECTIONS) {
      filtered[key] = groups[key].filter((item) => matches(item, query, category));
    }
    return filtered;
  }, [groups, query, category]);
  const visible = shown[tab];
  const elsewhere = SECTIONS.filter(({ key }) => key !== tab && shown[key].length > 0);

  return (
    <div className="grid gap-4 sm:gap-5">
      <NpcDialog lines={npcLines} onShowMustDo={() => showTab("must_do")} />

      <section className="window scroll-mt-4" aria-label="Your settings" ref={pickerRef}>
        <h2 className="window-title">
          Your Character
          <span className="window-note max-sm:hidden">Pick a job and the quests re-sort</span>
        </h2>
        <div className="window-body">
          <ProfilePicker
            profile={profile}
            priorities={priorities}
            playtime={playtime}
            onPlaytimeChange={setPlaytime}
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
          <div className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
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

          {rough && <RoughNotice items={allItems} />}

          <p className="text-xs text-ink-soft">
            {/* A plain link: the server builds the file for the chosen job and priorities. */}
            <a
              className="font-bold underline"
              href={`/api/calendar?profile=${profile}&priorities=${priorities.join(",")}&playtime=${playtime}`}
            >
              Add the deadlines to your calendar
            </a>{" "}
            (Must Do and If Free quests for your job, as an .ics file).
          </p>

          <div className="min-w-0">
            <div className="tabs" role="tablist" aria-label="Tiers" onKeyDown={onTabKeyDown}>
              {SECTIONS.map(({ key, title }) => {
                if ((key === "ended" || key === "soon") && groups[key].length === 0) return null;
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
                    <span className="tab-count">
                      {shown[key].length}
                      {filtering && <span className="sr-only"> matching</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              id="quest-panel"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              className={`tab-panel tier-${tab} ${rough ? "ratings-rough" : ""}`}
            >
              <p className="tab-blurb">
                <strong>{section.blurb}</strong>{" "}
                <span aria-live="polite">
                  {filtering
                    ? `Showing ${visible.length} of ${groups[tab].length}.`
                    : visible.length > 0 && "Soonest deadline first."}
                </span>
              </p>

              {visible.length > 0 ? (
                // The key remounts the list on a tab change so quests animate in.
                <ul key={tab} className="grid gap-2">
                  {visible.map((item, index) => (
                    <QuestItem
                      key={item.id}
                      item={item}
                      profile={profile}
                      now={now}
                      index={index}
                      planNote={plans.get(item.id)?.note ?? null}
                      isNew={
                        previousVisit !== null && Date.parse(item.source.publishedAt) > previousVisit
                      }
                    />
                  ))}
                </ul>
              ) : filtering && groups[tab].length > 0 ? (
                <div className="empty">
                  <PixelSprite name="bulb" className="empty-sprite" />
                  <p className="empty-title">No quests match here</p>
                  <p>
                    {elsewhere.length > 0
                      ? "Nothing in this tab fits your search, but other tabs have matches."
                      : "Nothing fits your search in any tab. Try a shorter word."}
                  </p>
                  <p className="flex flex-wrap justify-center gap-2">
                    {elsewhere.map(({ key, title }) => (
                      <button key={key} type="button" className="btn" onClick={() => setTab(key)}>
                        {title} ({shown[key].length})
                      </button>
                    ))}
                    <button type="button" className="btn btn-go" onClick={clearFilters}>
                      Clear search
                    </button>
                  </p>
                </div>
              ) : (
                <div className="empty">
                  <PixelSprite name={section.empty.sprite} className="empty-sprite" />
                  <p className="empty-title">{section.empty.title}</p>
                  <p>{section.empty.text}</p>
                  {tab === "must_do" && groups.if_free.length > 0 && (
                    <p>
                      <button type="button" className="btn btn-go" onClick={() => setTab("if_free")}>
                        See If Free ({groups.if_free.length})
                      </button>
                    </p>
                  )}
                </div>
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
        onChangeJob={() => scrollToTop(pickerRef.current)}
      />
    </div>
  );
}
