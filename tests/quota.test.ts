import { describe, expect, it } from "vitest";
import {
  emptyLedger,
  isAvailable,
  minGapMs,
  parseRateLimit,
  quotaDay,
  recordCall,
  recordRateLimit,
  waitBeforeCall,
} from "@/lib/classifier/quota";

const MODEL = "gemini-test";
const NOON = Date.UTC(2026, 9, 12, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("ledger", () => {
  it("labels the count with the UTC date", () => {
    expect(quotaDay(Date.UTC(2026, 9, 12, 23, 59))).toBe("2026-10-12");
    expect(quotaDay(Date.UTC(2026, 9, 13, 0, 0))).toBe("2026-10-13");
  });

  it("counts requests without blocking on the count alone", () => {
    let ledger = emptyLedger();
    for (let call = 0; call < 30; call += 1) ledger = recordCall(ledger, MODEL, NOON);
    expect(ledger.models[MODEL].used).toBe(30);
    // Only a refusal from Google blocks a model: the real quota is not a
    // counter we can mirror exactly.
    expect(isAvailable(ledger, MODEL, NOON)).toBe(true);
  });

  it("starts a fresh count on a new day", () => {
    let ledger = emptyLedger();
    for (let call = 0; call < 20; call += 1) ledger = recordCall(ledger, MODEL, NOON);
    ledger = recordCall(ledger, MODEL, NOON + 24 * HOUR);
    expect(ledger.models[MODEL].used).toBe(1);
  });

  it("blocks a model for as long as Google's refusal asks", () => {
    // The real refusal seen on 2026-10-12: per day, retry in 32779s (about 9 hours).
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "day", retryMs: 32_779_000 }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 9 * HOUR)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 9.2 * HOUR)).toBe(true);
  });

  it("keeps a block across midnight until its time has passed", () => {
    const late = Date.UTC(2026, 9, 12, 23, 0);
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "day", retryMs: 3 * HOUR }, late);
    expect(isAvailable(ledger, MODEL, late + 2 * HOUR)).toBe(false);
    expect(isAvailable(ledger, MODEL, late + 3 * HOUR + 1)).toBe(true);
  });

  it("rechecks after an hour when a per-day refusal gives no wait", () => {
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "day", retryMs: null }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 59 * MINUTE)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 61 * MINUTE)).toBe(true);
  });

  it("blocks a model only briefly after a per-minute refusal", () => {
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "minute", retryMs: 30_000 }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 10_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 31_000)).toBe(true);
  });

  it("never blocks for more than a day", () => {
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "day", retryMs: 99 * HOUR }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 24 * HOUR + 1)).toBe(true);
  });

  it("spaces calls to respect the per-minute limit", () => {
    const ledger = recordCall(emptyLedger(), MODEL, NOON);
    expect(waitBeforeCall(ledger, MODEL, NOON + 2_000)).toBe(minGapMs() - 2_000);
    expect(waitBeforeCall(ledger, MODEL, NOON + 60_000)).toBe(0);
    expect(waitBeforeCall(ledger, "another-model", NOON)).toBe(0);
  });
});

describe("parseRateLimit", () => {
  it("recognises a per-day quota and its wait", () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [
          { violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "32779s" },
        ],
      },
    });
    expect(parseRateLimit(body)).toEqual({ scope: "day", retryMs: 32_779_000 });
  });

  it("recognises a per-minute quota", () => {
    const body =
      '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"},{"retryDelay":"17.5s"}';
    expect(parseRateLimit(body)).toEqual({ scope: "minute", retryMs: 17_500 });
  });

  it("treats an unexplained refusal as per-minute with no known wait", () => {
    expect(parseRateLimit("Too many requests")).toEqual({ scope: "minute", retryMs: null });
  });
});
