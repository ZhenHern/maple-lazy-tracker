import type { TrackerItem } from "@/lib/types";

// Builds an iCalendar (.ics) file: the plain-text format that Google
// Calendar, Outlook and Apple Calendar all read. Each quest with an end date
// becomes one entry on its last day, so the deadline shows up where a player
// already looks. Pure code, so it can be tested without a server.

// Commas, semicolons, backslashes and line breaks have meaning in the format.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([,;])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");
}

// 2026-11-10T23:59:00.000Z -> 20261110T235900Z
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// The format caps a line at 75 bytes; longer ones continue on the next line
// after a leading space. Splitting by characters keeps us under the cap for
// the mostly-ASCII text we write.
function fold(line: string): string {
  const parts: string[] = [];
  for (let start = 0; start < line.length; start += 70) parts.push(line.slice(start, start + 70));
  return parts.join("\r\n ");
}

const HOUR = 3_600_000;

interface CalendarOptions {
  name: string;
  siteUrl: string;
  /** When the file is generated. Passed in so tests are repeatable. */
  now: Date;
}

export function buildCalendar(items: TrackerItem[], options: CalendarOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lazy Tracker//MapleStory deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
  ];

  for (const item of items) {
    if (!item.endsAt) continue;
    const end = new Date(item.endsAt);
    // A one-hour block ending at the deadline: visible in a day view, and
    // unlike an all-day entry it does not shift a day in other time zones.
    const start = new Date(end.getTime() - HOUR);
    const details = [item.summary, item.rewards.length ? `Rewards: ${item.rewards.join(", ")}` : ""]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      // Stable per quest, so re-importing updates an entry instead of duplicating it.
      `UID:${item.id}@lazy-tracker`,
      `DTSTAMP:${stamp(options.now.toISOString())}`,
      `DTSTART:${stamp(start.toISOString())}`,
      `DTEND:${stamp(end.toISOString())}`,
      `SUMMARY:${escapeText(`Last chance: ${item.title}`)}`,
      `DESCRIPTION:${escapeText(details)}`,
      `URL:${options.siteUrl}/`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // The format requires CRLF line endings.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
