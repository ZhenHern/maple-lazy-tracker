import { z } from "zod";

// Gemini's free tier allows a few requests per minute and a small number per
// day, per model, and FAILED requests count too. This ledger remembers what we
// have spent and which models have told us to stop, so a run never wastes a
// request on a model that is certain to refuse it.
//
// Everything here is pure (no I/O): the caller loads and saves the ledger.

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_PER_MINUTE = 5;
const MINUTE = 60_000;
const DAY = 86_400_000;

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

export function dailyLimit(): number {
  return positiveInt(process.env.GEMINI_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
}

/** Minimum gap between two calls to the same model, from the per-minute limit. */
export function minGapMs(): number {
  const perMinute = positiveInt(process.env.GEMINI_RPM, DEFAULT_PER_MINUTE);
  return Math.ceil(MINUTE / perMinute) + 500;
}

// Google resets daily quotas at midnight Pacific time, not UTC.
const pacificParts = new Intl.DateTimeFormat("en-CA", {
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
    pacificParts.formatToParts(new Date(now)).map((part) => [part.type, part.value]),
  );
}

/** The quota day `now` falls in, as YYYY-MM-DD in Pacific time. */
export function quotaDay(now: number): string {
  const { year, month, day } = pacific(now);
  return `${year}-${month}-${day}`;
}

/** When the daily quota next resets (the coming Pacific midnight), in ms. */
export function nextQuotaReset(now: number): number {
  const { hour, minute, second } = pacific(now);
  const elapsed = (Number(hour) * 60 + Number(minute)) * MINUTE + Number(second) * 1000;
  return now + (DAY - elapsed);
}

function usage(ledger: QuotaLedger, model: string, now: number) {
  const today = quotaDay(now);
  const entry = ledger.models[model];
  // A new quota day wipes the count and any block carried over from yesterday.
  if (!entry || entry.day !== today) {
    return { day: today, used: 0, blockedUntil: null, lastCallAt: entry?.lastCallAt ?? null };
  }
  return entry;
}

/** True when a call to `model` right now has a chance of being accepted. */
export function isAvailable(ledger: QuotaLedger, model: string, now: number): boolean {
  const entry = usage(ledger, model, now);
  if (entry.used >= dailyLimit()) return false;
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
  retryMs: number;
}

/** Notes that `model` refused a request, so later calls skip it until it recovers. */
export function recordRateLimit(
  ledger: QuotaLedger,
  model: string,
  limit: RateLimit,
  now: number,
): QuotaLedger {
  const entry = usage(ledger, model, now);
  const until = limit.scope === "day" ? nextQuotaReset(now) : now + limit.retryMs;
  return {
    models: {
      ...ledger.models,
      [model]: {
        ...entry,
        used: limit.scope === "day" ? Math.max(entry.used, dailyLimit()) : entry.used,
        blockedUntil: new Date(until).toISOString(),
      },
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
  const retryMs = delay ? Math.ceil(Number(delay[1]) * 1000) : MINUTE;
  if (/PerDay/i.test(message)) return { scope: "day", retryMs };
  if (/PerMinute/i.test(message)) return { scope: "minute", retryMs };
  // With no quota id at all, a long wait means the daily quota.
  return { scope: retryMs > 2 * MINUTE ? "day" : "minute", retryMs };
}

/** A one-line summary for logs and the ingest report. */
export function describeLedger(ledger: QuotaLedger, models: string[], now: number): string {
  return models
    .map((model) => {
      const entry = usage(ledger, model, now);
      const state = isAvailable(ledger, model, now) ? "ok" : "blocked";
      return `${model} ${entry.used}/${dailyLimit()} ${state}`;
    })
    .join(", ");
}
