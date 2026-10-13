import { z } from "zod";

// Gemini's free tier allows a few requests per minute and a small number per
// day, per model, and FAILED requests count too. This ledger remembers which
// models have told us to stop and for how long, so a run never wastes a
// request on a model that is certain to refuse it.
//
// When does a daily quota come back? Nothing we were told held up when measured:
// - Google's documentation says daily quotas reset at midnight Pacific time.
// - Its 429 body carries a "retry in" that pointed at 00:00 UTC on two days
//   running, yet on 2026-10-13 at 00:27 UTC the quota was still exhausted.
// - That same day at 03:50 UTC, three hours before Pacific midnight, two of
//   the refused models answered again.
// So no reset time is assumed. A per-day refusal blocks the model for a
// couple of hours, and then it is simply asked again; a refusal costs one
// tiny request. Per-minute refusals use Google's hint, where it is accurate.
//
// Everything here is pure (no I/O): the caller loads and saves the ledger.

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_PER_MINUTE = 5;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// How long a model is left alone after it says its daily quota is gone.
const DAY_REFUSAL_PAUSE = 2 * HOUR;

const usageSchema = z.object({
  /** The quota day (Pacific date) that `used` belongs to. */
  day: z.string(),
  used: z.number(),
  /** Do not call this model before this time (ISO), or null. */
  blockedUntil: z.string().nullable(),
  lastCallAt: z.string().nullable(),
});
export const ledgerSchema = z.object({ models: z.record(z.string(), usageSchema) });

export type QuotaLedger = z.infer<typeof ledgerSchema>;

export function emptyLedger(): QuotaLedger {
  return { models: {} };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** The documented daily limit. Shown in reports; it does not block anything. */
export function dailyLimit(): number {
  return positiveInt(process.env.GEMINI_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
}

/** Minimum gap between two calls to the same model, from the per-minute limit. */
export function minGapMs(): number {
  const perMinute = positiveInt(process.env.GEMINI_RPM, DEFAULT_PER_MINUTE);
  return Math.ceil(MINUTE / perMinute) + 500;
}

const pacificClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pacific(now: number): Record<string, string> {
  return Object.fromEntries(
    pacificClock.formatToParts(new Date(now)).map((part) => [part.type, part.value]),
  );
}

/** The quota day `now` falls in, as YYYY-MM-DD in Pacific time. */
export function quotaDay(now: number): string {
  const { year, month, day } = pacific(now);
  return `${year}-${month}-${day}`;
}

/** The coming Pacific midnight, in ms: when the documented quota day ends. */
export function nextQuotaReset(now: number): number {
  const { hour, minute, second } = pacific(now);
  const elapsed = (Number(hour) * 60 + Number(minute)) * MINUTE + Number(second) * 1000;
  return now + (DAY - elapsed);
}

function usage(ledger: QuotaLedger, model: string, now: number) {
  const today = quotaDay(now);
  const entry = ledger.models[model];
  if (!entry) return { day: today, used: 0, blockedUntil: null, lastCallAt: null };
  // A new day restarts the count. A block is NOT cleared here: it ends when
  // the time Google gave has passed, whatever the date.
  return entry.day === today ? entry : { ...entry, day: today, used: 0 };
}

/**
 * True when a call to `model` right now has a chance of being accepted.
 *
 * Only a refusal from Google blocks a model. Our own count of requests does
 * not: the real quota is not a counter we can mirror exactly, so the count is
 * kept for the report and nothing else.
 */
export function isAvailable(ledger: QuotaLedger, model: string, now: number): boolean {
  const entry = usage(ledger, model, now);
  return entry.blockedUntil === null || Date.parse(entry.blockedUntil) <= now;
}

/** How long to wait before calling `model`, to stay inside the per-minute limit. */
export function waitBeforeCall(ledger: QuotaLedger, model: string, now: number): number {
  const last = usage(ledger, model, now).lastCallAt;
  return last ? Math.max(0, Date.parse(last) + minGapMs() - now) : 0;
}

/** Counts one request against `model`. Call it for every attempt, failed or not. */
export function recordCall(ledger: QuotaLedger, model: string, now: number): QuotaLedger {
  const entry = usage(ledger, model, now);
  return {
    models: {
      ...ledger.models,
      [model]: { ...entry, used: entry.used + 1, lastCallAt: new Date(now).toISOString() },
    },
  };
}

export interface RateLimit {
  /** "day": the daily quota is gone. "minute": too fast, wait and retry. */
  scope: "day" | "minute";
  /** How long Google asked us to wait, or null when it did not say. */
  retryMs: number | null;
}

/** Notes that `model` refused a request, so later calls skip it until it recovers. */
export function recordRateLimit(
  ledger: QuotaLedger,
  model: string,
  limit: RateLimit,
  now: number,
): QuotaLedger {
  const entry = usage(ledger, model, now);
  // Per day: a fixed pause, then it is asked again (see the note at the top).
  // Per minute: for as long as Google asks, or a minute when it does not say.
  const until =
    limit.scope === "day"
      ? now + DAY_REFUSAL_PAUSE
      : now + Math.min(limit.retryMs ?? MINUTE, HOUR);
  return {
    models: {
      ...ledger.models,
      [model]: { ...entry, blockedUntil: new Date(until).toISOString() },
    },
  };
}

/**
 * Reads a 429 error body. Google says which quota was hit (`quotaId` contains
 * "PerDay" or "PerMinute") and how long to wait (`retryDelay`, e.g. "37s").
 * The distinction matters: a per-minute refusal clears in seconds, so it is
 * worth waiting for instead of dropping to a weaker model.
 */
export function parseRateLimit(message: string): RateLimit {
  const delay = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(message);
  const retryMs = delay ? Math.ceil(Number(delay[1]) * 1000) : null;
  if (/PerDay/i.test(message)) return { scope: "day", retryMs };
  if (/PerMinute/i.test(message)) return { scope: "minute", retryMs };
  // With no quota id at all, a long wait means the daily quota.
  return { scope: retryMs !== null && retryMs > 2 * MINUTE ? "day" : "minute", retryMs };
}

/** A one-line summary for logs and the ingest report. */
export function describeLedger(ledger: QuotaLedger, models: string[], now: number): string {
  return models
    .map((model) => {
      const entry = usage(ledger, model, now);
      const state = isAvailable(ledger, model, now)
        ? "ok"
        : `refused, retry after ${entry.blockedUntil?.slice(0, 16).replace("T", " ")} UTC`;
      return `${model}: ${entry.used} used today (limit about ${dailyLimit()}), ${state}`;
    })
    .join("; ");
}
