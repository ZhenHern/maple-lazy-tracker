import { describe, expect, it } from "vitest";
import {
  emptyLedger,
  isAvailable,
  minGapMs,
  nextQuotaReset,
  recordBusy,
  parseRateLimit,
  quotaDay,
  recordCall,
  recordRateLimit,
  waitBeforeCall,
} from "@/lib/classifier/quota";

const MODEL = "gemini-test";
// 2026-10-12 12:00 UTC is 05:00 in California (PDT, UTC-7).
const NOON = Date.UTC(2026, 9, 12, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("quota day", () => {
  it("follows Pacific time, not UTC", () => {
    expect(quotaDay(Date.UTC(2026, 9, 12, 6, 59))).toBe("2026-10-11");
    expect(quotaDay(Date.UTC(2026, 9, 12, 7, 0))).toBe("2026-10-12");
  });

  it("resets at the next Pacific midnight", () => {
    expect(new Date(nextQuotaReset(NOON)).toISOString()).toBe("2026-10-13T07:00:00.000Z");
  });
});

describe("ledger", () => {
  it("counts requests without blocking on the count alone", () => {
    let ledger = emptyLedger();
    for (let call = 0; call < 30; call += 1) ledger = recordCall(ledger, MODEL, NOON);
    expect(ledger.models[MODEL].used).toBe(30);
    // Only a refusal from Google blocks a model: the real quota is not a
    // counter we can mirror exactly.
    expect(isAvailable(ledger, MODEL, NOON)).toBe(true);
  });

  it("starts a fresh count on a new quota day", () => {
    let ledger = emptyLedger();
    for (let call = 0; call < 20; call += 1) ledger = recordCall(ledger, MODEL, NOON);
    ledger = recordCall(ledger, MODEL, NOON + 24 * HOUR);
    expect(ledger.models[MODEL].used).toBe(1);
  });

  it("leaves a model alone for two hours after a per-day refusal, then asks again", () => {
    // No reset time is trusted: Google's hint ("retry in 32779s") and the
    // documented Pacific midnight were both wrong when measured.
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "day", retryMs: 32_779_000 }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 119 * 60_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 121 * 60_000)).toBe(true);
  });

  it("leaves an overloaded model alone for ten minutes", () => {
    const ledger = recordBusy(emptyLedger(), MODEL, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 9 * 60_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 11 * 60_000)).toBe(true);
  });

  it("blocks a model only as long as asked after a per-minute refusal", () => {
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "minute", retryMs: 30_000 }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 10_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 31_000)).toBe(true);
  });

  it("waits a minute when a per-minute refusal gives no time", () => {
    const ledger = recordRateLimit(emptyLedger(), MODEL, { scope: "minute", retryMs: null }, NOON);
    expect(isAvailable(ledger, MODEL, NOON + 59_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON + 61_000)).toBe(true);
  });

  it("spaces calls to respect the per-minute limit", () => {
    const ledger = recordCall(emptyLedger(), MODEL, NOON);
    expect(waitBeforeCall(ledger, MODEL, NOON + 2_000)).toBe(minGapMs() - 2_000);
    expect(waitBeforeCall(ledger, MODEL, NOON + 60_000)).toBe(0);
    expect(waitBeforeCall(ledger, "another-model", NOON)).toBe(0);
  });
});

describe("parseRateLimit", () => {
  it("recognises a per-day quota and its hint", () => {
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
