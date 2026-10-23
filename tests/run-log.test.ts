import { describe, expect, it } from "vitest";
import type { IngestReport, IngestResult } from "@/lib/ingest";
import { buildOngoing } from "@/lib/ongoing";
import { nextRunLog, parseRunLog, summarizeRun } from "@/lib/run-log";

function report(...statuses: IngestResult["status"][]): IngestReport {
  return {
    results: statuses.map((status, index) => ({ sourceId: String(index), title: `Post ${index}`, status })),
    requests: 0,
    quota: "",
  };
}

const MONDAY = "2026-10-19T08:31:00.000Z";
const TUESDAY = "2026-10-20T08:31:00.000Z";

describe("summarizeRun", () => {
  it("counts checked and changed posts, even when nothing changed", () => {
    expect(summarizeRun(report("unchanged", "unchanged", "unchanged"))).toBe("3 checked, 0 changed");
  });

  it("counts every kind of new rating as a change, and adds waiting and failed only when present", () => {
    expect(
      summarizeRun(report("classified", "provisional", "unrated", "deferred", "failed", "unchanged")),
    ).toBe("6 checked, 3 changed, 1 waiting, 1 failed");
  });
});

describe("nextRunLog", () => {
  it("records a successful run as both the latest attempt and the latest success", () => {
    expect(nextRunLog(null, { ok: true, report: report("unchanged") }, MONDAY)).toEqual({
      lastAttemptAt: MONDAY,
      ok: true,
      summary: "1 checked, 0 changed",
      lastSuccessAt: MONDAY,
    });
  });

  it("keeps the previous success time when a run fails, so the page never claims a check that failed", () => {
    const monday = nextRunLog(null, { ok: true, report: report("unchanged") }, MONDAY);
    expect(nextRunLog(monday, { ok: false, error: "Nexon news API returned 503" }, TUESDAY)).toEqual({
      lastAttemptAt: TUESDAY,
      ok: false,
      summary: "Nexon news API returned 503",
      lastSuccessAt: MONDAY,
    });
  });

  it("has no success time when the very first run fails", () => {
    expect(nextRunLog(null, { ok: false, error: "boom" }, MONDAY).lastSuccessAt).toBeNull();
  });
});

describe("parseRunLog", () => {
  it("accepts a stored record and refuses anything else", () => {
    const stored = nextRunLog(null, { ok: true, report: report() }, MONDAY);
    expect(parseRunLog(stored)).toEqual(stored);
    expect(parseRunLog(null)).toBeNull();
    expect(parseRunLog({ lastAttemptAt: MONDAY })).toBeNull();
  });
});

describe("the ongoing list", () => {
  it("carries the last successful check, separate from the newest rating", () => {
    const now = Date.parse(TUESDAY);
    expect(buildOngoing([], now, false, MONDAY).checkedAt).toBe(MONDAY);
    expect(buildOngoing([], now, false).checkedAt).toBeNull();
  });
});
