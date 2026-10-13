import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { readAllPosts } from "@/lib/db/store";
import {
  AXES,
  buildDayPlans,
  buildReview,
  type Axis,
  type Rated,
  type ReviewRow,
} from "@/lib/dev/review";
import { readLatestTrial } from "@/lib/dev/trial";

// The prompt lab's review page, at /dev/review. Development only.
//
// It lists every running quest with the tier each kind of player gets and the
// raw score behind it. After a trial (/api/dev/try) it also shows what the
// trial would change, so a prompt edit can be judged quest by quest before
// anything live is replaced.

export const metadata: Metadata = { title: "Prompt lab | Lazy Tracker", robots: { index: false } };

const AXIS_LABEL: Record<Axis, string> = {
  casual: "Casual",
  endgame: "Endgame",
  returning: "Returning",
  limited: "Limited",
  cosmetic: "Cosmetic",
};
const TIER_LABEL = { must_do: "Must", if_free: "Free", skip: "Skip" };
const STATUS_LABEL = { same: "", changed: "Changed", new: "New in trial", gone: "Gone in trial" };

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "none";
}

function Cell({ live, trial }: { live: Rated | null; trial: Rated | null }) {
  const moved = live && trial && live.tier !== trial.tier;
  const shown = trial && !live ? trial : live;
  return (
    <td className={moved ? "review-moved" : undefined}>
      {shown && (
        <span className={`review-tier tier-${shown.tier}`}>
          {TIER_LABEL[shown.tier]} <small>{shown.score}</small>
        </span>
      )}
      {/* The trial's value, when a trial covers this quest and differs at all. */}
      {live && trial && (live.tier !== trial.tier || live.score !== trial.score) && (
        <span className={`review-tier review-after tier-${trial.tier}`}>
          → {TIER_LABEL[trial.tier]} <small>{trial.score}</small>
        </span>
      )}
    </td>
  );
}

function Row({ row }: { row: ReviewRow }) {
  return (
    <tr className={`review-${row.status}`}>
      <th scope="row">
        <span className="review-title">
          {row.title}
          {row.status !== "same" && <span className="chip chip-provisional">{STATUS_LABEL[row.status]}</span>}
        </span>
        {row.why && <span className="review-why">{row.why}</span>}
        <span className="review-note">{row.summary}</span>
        <span className="review-note">
          {row.category} · starts {day(row.startsAt)} · ends {day(row.endsAt)}
{" "}
          · time class: {row.timeCost}
          {row.time && ` (${row.time})`}
        </span>
        {row.rewards.length > 0 && <span className="review-note">Rewards: {row.rewards.join("; ")}</span>}
        {row.steps.length > 0 && <span className="review-note">Steps: {row.steps.join("; ")}</span>}
      </th>
      {AXES.map((axis) => (
        <Cell key={axis} live={row.live?.[axis] ?? null} trial={row.trial?.[axis] ?? null} />
      ))}
    </tr>
  );
}

// Reading the clock and the files is kept out of the component: a component
// should only turn data into markup (the lint rule "purity" enforces this).
async function loadReview() {
  const [posts, trial] = await Promise.all([readAllPosts(), readLatestTrial()]);
  const { rows, differences } = buildReview(posts, trial?.posts ?? [], Date.now());
  // Rows arrive sorted by post, so grouping is one pass.
  const groups = new Map<string, ReviewRow[]>();
  for (const row of rows) groups.set(row.sourceId, [...(groups.get(row.sourceId) ?? []), row]);
  const now = Date.now();
  return {
    trial,
    differences,
    groups,
    // The page's default (nothing picked, all three count) and progression only.
    plans: [
      { label: "Default: no priority picked, so progression, limited and cosmetic all count", ...buildDayPlans(posts, [], now) },
      { label: "Progression only", ...buildDayPlans(posts, ["progression"], now) },
    ],
  };
}

async function Lab() {
  // This page must show the files as they are right now, so it opts out of
  // being built ahead of time.
  await connection();
  const { trial, differences, groups, plans } = await loadReview();

  return (
    <>
      <section className="window">
        <h1 className="window-title">Prompt lab</h1>
        <div className="window-body grid gap-2 text-sm">
          <p>
            Every running quest, with the tier each kind of player gets and the model&apos;s raw
            score. The code&apos;s prompt is <strong>version {PROMPT_VERSION}</strong>.
          </p>
          {trial ? (
            <p>
              <strong>Latest trial:</strong> {trial.createdAt.slice(0, 16).replace("T", " ")} UTC,
              prompt v{trial.promptVersion}, {trial.models.join(", ") || "no model answered"},{" "}
              {trial.posts.length} posts, {trial.requests} requests.{" "}
              <strong>{differences} quests differ</strong> from live. An arrow shows the
              trial&apos;s value; a yellow cell means the tier moved.
            </p>
          ) : (
            <p>No trial yet. The table shows the live ratings only.</p>
          )}
          {trial && Object.keys(trial.problems).length > 0 && (
            <p className="review-note">
              Not in the trial:{" "}
              {Object.entries(trial.problems)
                .map(([id, reason]) => `${id} (${reason.slice(0, 90)})`)
                .join("; ")}
            </p>
          )}
          <ul className="review-help">
            <li>
              <a href="/api/dev/try">/api/dev/try</a>: try the current prompt (1 request, trusted
              models). Add <code>?tier=fallback</code> for the backup model, <code>?ids=45330</code>{" "}
              to pick posts, <code>?limit=2</code> for more requests.
            </li>
            <li>
              <a href="/api/dev/try?promote">/api/dev/try?promote</a>: save the latest trial as the
              live data, without spending the requests again.
            </li>
            <li>
              <a href="/api/status">/api/status</a>: quota and rating counts.
            </li>
          </ul>
        </div>
      </section>

      {plans.map((plan) => (
        <section key={plan.label} className="window">
          <h2 className="window-title">
            Day plans
            <span className="window-note">{plan.label}</span>
          </h2>
          <div className="window-body review-scroll">
            <p className="review-note">
              What the home page shows each kind of player. M = Must Do, F = If Free, S = Skip. A
              plus means promoted for taking a minute; a minus means moved down for not fitting the
              playtime; the word soon means it has not opened, so it is shown under Coming Soon and takes
              no time today. The last rows give the Must Do count and its minutes a day.
            </p>
            <table className="review-table">
              <thead>
                <tr>
                  <th scope="col">Quest (time class)</th>
                  {plan.columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.profile} {column.playtime}m
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <span className="review-title">{row.title}</span>
                      <span className="review-note">
                        {row.timeCost} · starts {day(row.startsAt)} · ends {day(row.endsAt)}
                      </span>
                    </th>
                    {plan.columns.map((column) => {
                      const cell = row.cells[column.key];
                      return (
                        <td key={column.key}>
                          <span className={`review-tier tier-${cell.tier}`}>
                            {TIER_LABEL[cell.tier][0]}
                            {cell.note === "quick"
                              ? "+"
                              : cell.note === "over"
                                ? "-"
                                : cell.note === "soon"
                                  ? " soon"
                                  : cell.note === "claim"
                                    ? " claim"
                                    : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row">Must Do quests</th>
                  {plan.columns.map((column) => (
                    <td key={column.key}>{column.mustDo}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Minutes a day</th>
                  {plan.columns.map((column) => (
                    <td key={column.key}>{column.minutes}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {[...groups].map(([sourceId, group]) => (
        <section key={sourceId} className="window">
          <h2 className="window-title">
            {group[0].postTitle}
            <span className="window-note">
              post {sourceId} · {group[0].model}
            </span>
          </h2>
          <div className="window-body review-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th scope="col">Quest</th>
                  {AXES.map((axis) => (
                    <th key={axis} scope="col">
                      {AXIS_LABEL[axis]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.map((row) => (
                  <Row key={row.key} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

export default function ReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="review-page">
      {/* Suspense lets the static frame go out first while the files are read. */}
      <Suspense fallback={<p className="footnote">Reading the store...</p>}>
        <Lab />
      </Suspense>
    </div>
  );
}
