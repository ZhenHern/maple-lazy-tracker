// The numbers behind the "Today's Plan" window: how the Must Do list splits the
// player's daily playtime, and how much of the list can safely wait.
// Plain functions with no React in them, so the tests can call them directly.

import type { Playtime } from "@/lib/tiering";

export interface PlanEntry {
  id: string;
  title: string;
  /** Minutes a day, averaged over the week (see dailyMinutes in lib/tiering.ts). */
  minutes: number;
}

export interface PlanSegment extends PlanEntry {
  /** The share of the bar this quest fills, 0-100. */
  share: number;
}

export interface PlanBar {
  /** Longest quest first. Quests that cost no time (idle ones) are left out. */
  segments: PlanSegment[];
  /** The share of the bar left empty, 0-100. Zero with no limit or a full day. */
  free: number;
  /** Minutes a day the Must Do quests add up to, rounded. */
  used: number;
  /** Minutes left in the playtime, rounded; null when there is no limit. */
  spare: number | null;
  /** True when the quests need more minutes than the playtime gives. */
  over: boolean;
}

/**
 * Lays the Must Do quests out along a bar the length of the daily playtime.
 * When the quests need more than the playtime (a few one-minute claims always
 * stay in, see planDay) or there is no limit, the bar is the quests' own total.
 */
export function planBar(entries: PlanEntry[], playtime: Playtime): PlanBar {
  const counted = entries
    .filter((entry) => entry.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const total = counted.reduce((sum, entry) => sum + entry.minutes, 0);
  const scale = Math.max(playtime, total);

  return {
    segments: counted.map((entry) => ({
      ...entry,
      share: scale === 0 ? 0 : (entry.minutes / scale) * 100,
    })),
    free: playtime === 0 || scale === 0 ? 0 : (Math.max(0, playtime - total) / scale) * 100,
    used: Math.round(total),
    spare: playtime === 0 ? null : Math.max(0, Math.round(playtime - total)),
    over: playtime > 0 && Math.round(total) > playtime,
  };
}

export interface Laziness {
  /** 0 to 10, one level per ten percent of the list that can wait. */
  level: number;
  /** The share of running quests that are If Free or Skip, 0-100. */
  percent: number;
  title: string;
}

// Best first: the first row whose threshold the percentage reaches.
const LAZY_TITLES = [
  { from: 80, title: "Legendary Slacker" },
  { from: 60, title: "Professional Napper" },
  { from: 40, title: "Part-time Hero" },
  { from: 20, title: "Steady Grinder" },
  { from: 0, title: "Workaholic" },
];

/**
 * How lazy this player is allowed to be: the share of quests that are not a
 * Must Do. Null when nothing is running, because there is nothing to measure.
 */
export function laziness(counts: { must_do: number; if_free: number; skip: number }): Laziness | null {
  const total = counts.must_do + counts.if_free + counts.skip;
  if (total === 0) return null;
  const percent = Math.round(((counts.if_free + counts.skip) / total) * 100);
  const { title } = LAZY_TITLES.find((row) => percent >= row.from)!;
  return { level: Math.min(10, Math.floor(percent / 10)), percent, title };
}
