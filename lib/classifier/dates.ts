// Finds the dates Nexon writes in its posts, for example
// "October 7, 2026 12:00 AM UTC" or "November 10 11:59 PM UTC".
// Used to check the dates a model returns and to date events without a model.

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const DAY = 86_400_000;

const DATE_PATTERN = new RegExp(
  `\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?` +
    `(?:\\s+at)?(?:\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)(?:\\s*UTC)?)?`,
  "gi",
);

export interface TextDate {
  /** Position in the text, so callers can tell which date came first. */
  index: number;
  /** The instant in ms. Midnight UTC when the text gives no time. */
  time: number;
  hasTime: boolean;
}

export function dayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Every date written in `text`, read as UTC (Nexon states times in UTC).
 * A date without a year takes the year that puts it nearest after `publishedAt`.
 */
export function findDates(text: string, publishedAt: string): TextDate[] {
  const published = Date.parse(publishedAt);
  const publishYear = new Date(published).getUTCFullYear();
  const dates: TextDate[] = [];

  for (const match of text.matchAll(DATE_PATTERN)) {
    const [, monthName, dayText, yearText, hourText, minuteText, meridiem] = match;
    const month = MONTHS.indexOf(monthName.toLowerCase());
    const day = Number(dayText);
    if (day < 1 || day > 31) continue;

    let hour = 0;
    let minute = 0;
    if (hourText) {
      hour = (Number(hourText) % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
      minute = Number(minuteText);
    }

    let year = yearText ? Number(yearText) : publishYear;
    let time = Date.UTC(year, month, day, hour, minute);
    // "January 5" in a December post means next January.
    if (!yearText && time < published - 60 * DAY) {
      year += 1;
      time = Date.UTC(year, month, day, hour, minute);
    }
    dates.push({ index: match.index, time, hasTime: Boolean(hourText) });
  }
  return dates;
}

/**
 * True when `iso` falls on a day the post mentions, give or take a day (posts
 * list the same moment in several time zones) or on the post's publish date
 * ("after maintenance" means the day the patch went live).
 */
export function isGroundedDate(iso: string, dates: TextDate[], publishedAt: string): boolean {
  const time = Date.parse(iso);
  const days = new Set(dates.map((date) => dayOf(date.time)));
  const published = Date.parse(publishedAt);
  for (const offset of [0, DAY, 2 * DAY]) days.add(dayOf(published + offset));
  return [-DAY, 0, DAY].some((offset) => days.has(dayOf(time + offset)));
}
