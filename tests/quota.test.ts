import { describe, expect, it } from "vitest";
import {
  emptyLedger,
  isAvailable,
  minGapMs,
  nextQuotaReset,
  parseRateLimit,
  quotaDay,
  recordCall,
  recordRateLimit,
  waitBeforeCall,
} from "@/lib/classifier/quota";

const MODEL = "gemini-test";
// 2026-10-12 12:00 UTC is 05:00 in California (PDT, UTC-7).
const NOON_UTC = Date.UTC(2026, 9, 12, 12, 0, 0);

describe("quota day", () => {
  it("follows Pacific time, not UTC", () => {
    expect(quotaDay(Date.UTC(2026, 9, 12, 6, 59))).toBe("2026-10-11");
    expect(quotaDay(Date.UTC(2026, 9, 12, 7, 0))).toBe("2026-10-12");
  });

  it("resets at the next Pacific midnight", () => {
    expect(new Date(nextQuotaReset(NOON_UTC)).toISOString()).toBe("2026-10-13T07:00:00.000Z");
  });
});

describe("ledger", () => {
  it("allows a model until its daily limit is spent", () => {
    let ledger = emptyLedger();
    for (let call = 0; call < 20; call += 1) {
      expect(isAvailable(ledger, MODEL, NOON_UTC)).toBe(true);
      ledger = recordCall(ledger, MODEL, NOON_UTC);
    }
    expect(isAvailable(ledger, MODEL, NOON_UTC)).toBe(false);
  });

  it("forgets yesterday's spending on a new quota day", () => {
    let ledger = emptyLedger();
    for (let call = 0; call < 20; call += 1) ledger = recordCall(ledger, MODEL, NOON_UTC);
    expect(isAvailable(ledger, MODEL, NOON_UTC + 24 * 3_600_000)).toBe(true);
  });

  it("blocks a model for the rest of the day after a per-day refusal", () => {
    const ledger = recordRateLimit(
      emptyLedger(),
      MODEL,
      { scope: "day", retryMs: 30_000 },
      NOON_UTC,
    );
    expect(isAvailable(ledger, MODEL, NOON_UTC + 3_600_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, nextQuotaReset(NOON_UTC) + 1000)).toBe(true);
  });

  it("blocks a model only briefly after a per-minute refusal", () => {
    const ledger = recordRateLimit(
      emptyLedger(),
      MODEL,
      { scope: "minute", retryMs: 30_000 },
      NOON_UTC,
    );
    expect(isAvailable(ledger, MODEL, NOON_UTC + 10_000)).toBe(false);
    expect(isAvailable(ledger, MODEL, NOON_UTC + 31_000)).toBe(true);
  });

  it("spaces calls to respect the per-minute limit", () => {
    const ledger = recordCall(emptyLedger(), MODEL, NOON_UTC);
    expect(waitBeforeCall(ledger, MODEL, NOON_UTC + 2_000)).toBe(minGapMs() - 2_000);
    expect(waitBeforeCall(ledger, MODEL, NOON_UTC + 60_000)).toBe(0);
    expect(waitBeforeCall(ledger, "another-model", NOON_UTC)).toBe(0);
  });
});

describe("parseRateLimit", () => {
  it("recognises a per-day quota", () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [
          { violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "41s" },
        ],
      },
    });
    expect(parseRateLimit(body)).toEqual({ scope: "day", retryMs: 41_000 });
  });

  it("recognises a per-minute quota", () => {
    const body =
      '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"},{"retryDelay":"17.5s"}';
    expect(parseRateLimit(body)).toEqual({ scope: "minute", retryMs: 17_500 });
  });

  it("treats an unexplained refusal as per-minute", () => {
    expect(parseRateLimit("Too many requests")).toEqual({ scope: "minute", retryMs: 60_000 });
  });
});
