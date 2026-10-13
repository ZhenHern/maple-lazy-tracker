import { findDates } from "./dates";

// Reads a dated schedule out of a post in plain code. Patch notes list
// rotating perk days (Sunny Sunday) as a table: a "Date" column and a "Perks"
// column, one row per day. A table of dates is exactly what code reads
// reliably and a model does not: it drops a day, or keeps advertising one
// that has passed. Nothing here knows the name "Sunny Sunday"; any section
// with such a table is a schedule, whatever next patch calls it.

export interface ScheduleDay {
  /** The day, as the instant it starts (00:00 UTC). */
  startsAt: string;
  /** The instant it ends (the next 00:00 UTC). */
  endsAt: string;
  perks: string[];
}

export interface Schedule {
  /** The heading of the section the table sits under. */
  title: string;
  /** The sentence under the heading, if any. */
  intro: string;
  days: ScheduleDay[];
}

const DAY = 86_400_000;
// The header row of a schedule table: a "Date" cell, then another column.
const TABLE_HEAD = /^date\b[^\n|]*\|/im;
const BULLET = /^[-*•]\s+/;
// A note under a perk, not a perk of its own.
const NOTE = /^(excludes?|except|note:|does not|not applicable)/i;

/** Every dated schedule table in `text`, in the order they appear. */
export function findSchedules(text: string, publishedAt: string): Schedule[] {
  const schedules: Schedule[] = [];
  // Sections start at "## Heading" lines.
  const sections = text.split(/^##\s+/m).slice(1);

  for (const section of sections) {
    const head = TABLE_HEAD.exec(section);
    if (!head) continue;
    const [titleLine = "", ...introLines] = section.slice(0, head.index).split("\n");
    const title = titleLine.trim();
    if (!title) continue;
    const intro = introLines.map((line) => line.trim()).find((line) => line.length > 20 && !BULLET.test(line)) ?? "";

    const days: ScheduleDay[] = [];
    let current: ScheduleDay | null = null;
    for (const raw of section.slice(head.index).split("\n").slice(1)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^back to top$/i.test(line)) break;

      if (BULLET.test(line)) {
        if (!current) continue;
        const perk = line.replace(BULLET, "").replace(/\s*\|\s*$/, "").trim();
        if (!perk) continue;
        if (NOTE.test(perk) && current.perks.length > 0) {
          // "Excludes Monster Park Extreme" belongs to the perk above it.
          current.perks[current.perks.length - 1] += ` (${perk.replace(/\.$/, "")})`;
        } else {
          current.perks.push(perk);
        }
        continue;
      }

      // A row starts with its date: "October 18, 2026 |".
      const [date] = line.endsWith("|") ? findDates(line, publishedAt) : [];
      if (date) {
        const start = Math.floor(date.time / DAY) * DAY;
        current = {
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + DAY).toISOString(),
          perks: [],
        };
        days.push(current);
      }
    }

    const filled = days.filter((day) => day.perks.length > 0);
    // One dated row is an event period, not a schedule.
    if (filled.length >= 2) schedules.push({ title, intro, days: filled });
  }
  return schedules;
}
