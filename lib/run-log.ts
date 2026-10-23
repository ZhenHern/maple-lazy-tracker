import { z } from "zod";
import type { IngestReport, IngestResult } from "@/lib/ingest";

/** The store's meta key for the record of the latest ingest run. */
export const RUN_LOG_KEY = "last-run";

// A post's rating only changes when Nexon edits the post, so the newest rating
// date says nothing about whether the daily job is still running. This record
// does: it is written on every run, successful or not.
export const runLogSchema = z.object({
  /** When the latest run finished, successful or not. */
  lastAttemptAt: z.string(),
  ok: z.boolean(),
  /** One line, such as "14 checked, 0 changed" or the error of a failed run. */
  summary: z.string(),
  /** When a run last finished without error, or null if none has yet. */
  lastSuccessAt: z.string().nullable(),
});

export type RunLog = z.infer<typeof runLogSchema>;

export type RunOutcome = { ok: true; report: IngestReport } | { ok: false; error: string };

// Statuses that mean the post was rated again in this run.
const CHANGED: IngestResult["status"][] = ["classified", "provisional", "unrated"];

/** "14 checked, 1 changed, 2 waiting, 1 failed", leaving out zero counts except the first two. */
export function summarizeRun(report: IngestReport): string {
  const count = (statuses: IngestResult["status"][]) =>
    report.results.filter((result) => statuses.includes(result.status)).length;
  const parts = [`${report.results.length} checked`, `${count(CHANGED)} changed`];
  const waiting = count(["deferred"]);
  const failed = count(["failed"]);
  if (waiting > 0) parts.push(`${waiting} waiting`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(", ");
}

/**
 * The record after a run. A failed run keeps the previous success time, so
 * "last checked" never claims a check that did not happen.
 */
export function nextRunLog(previous: RunLog | null, outcome: RunOutcome, at: string): RunLog {
  return outcome.ok
    ? { lastAttemptAt: at, ok: true, summary: summarizeRun(outcome.report), lastSuccessAt: at }
    : {
        lastAttemptAt: at,
        ok: false,
        summary: outcome.error.slice(0, 300),
        lastSuccessAt: previous?.lastSuccessAt ?? null,
      };
}

/** A stored record, or null when there is none or it does not have the expected shape. */
export function parseRunLog(value: unknown): RunLog | null {
  const parsed = runLogSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
