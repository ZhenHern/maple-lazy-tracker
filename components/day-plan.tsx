import type { CSSProperties } from "react";
import { laziness, planBar, type PlanBar, type PlanEntry } from "@/lib/day-plan";
import type { Playtime } from "@/lib/tiering";
import { PixelSprite } from "./pixel-sprite";

// "Today's Plan": an MP-style bar for the daily playtime, filled block by block
// with the Must Do quests, plus a laziness meter. Everything is worked out from
// the list already on the page, so it changes the moment the job, priorities or
// playtime change, and costs nothing.

interface DayPlanProps {
  /** The Must Do quests of the day's plan, with the minutes each one costs. */
  entries: PlanEntry[];
  playtime: Playtime;
  counts: { must_do: number; if_free: number; skip: number };
  /** Takes the visitor to a quest in the list. */
  onJump: (id: string) => void;
}

function minutesLabel(minutes: number): string {
  return minutes < 1 ? "<1 min" : `${Math.round(minutes)} min`;
}

function readout(bar: PlanBar, playtime: Playtime): string {
  if (bar.used === 0) return "Nothing on your Must Do list costs any playtime today.";
  if (playtime === 0) return `Your Must Do list takes about ${bar.used} min a day. No time limit set.`;
  if (bar.over) {
    return `About ${bar.used} min, a little over your ${playtime}. One-minute claims are always in.`;
  }
  return `${bar.used} of ${playtime} min planned. ${bar.spare} min to spare.`;
}

export function DayPlan({ entries, playtime, counts, onJump }: DayPlanProps) {
  const bar = planBar(entries, playtime);
  const lazy = laziness(counts);

  return (
    <section className="window" aria-label="Today's plan">
      <h2 className="window-title">
        Today&apos;s Plan
        <span className="window-note max-sm:hidden">Click a block to jump to the quest</span>
      </h2>
      <div className="window-body grid gap-3">
        {/* The bar is a picture of the list below it. The chips under it do the
            same job for keyboards and screen readers, so the blocks are skipped. */}
        <div className="mp" aria-hidden="true">
          {bar.segments.map((segment, position) => (
            <button
              key={segment.id}
              type="button"
              tabIndex={-1}
              className="mp-seg"
              data-tone={position % 4}
              style={{ "--grow": segment.share, "--i": position } as CSSProperties}
              title={`${segment.title}: about ${minutesLabel(segment.minutes)} a day`}
              onClick={() => onJump(segment.id)}
            />
          ))}
          {bar.free > 0 && <span className="mp-free" style={{ "--grow": bar.free } as CSSProperties} />}
        </div>

        <p className="plan-readout">{readout(bar, playtime)}</p>

        {bar.segments.length > 0 && (
          <ul className="plan-legend" aria-label="Must Do quests by time">
            {bar.segments.map((segment, position) => (
              <li key={segment.id}>
                <button
                  type="button"
                  className="plan-chip"
                  data-tone={position % 4}
                  onClick={() => onJump(segment.id)}
                >
                  <span className="plan-dot" aria-hidden="true" />
                  <span className="plan-chip-name">{segment.title}</span>
                  <b>{minutesLabel(segment.minutes)}</b>
                </button>
              </li>
            ))}
          </ul>
        )}

        {lazy && (
          <div className="lazy-meter">
            <span className="lazy-level">
              <PixelSprite name="cup" className="h-5 w-5 shrink-0" />
              LAZY LV. {lazy.level}
            </span>
            <span className="gauge lazy-gauge" aria-hidden="true">
              <span
                className="gauge-fill"
                style={{ "--fill": `${lazy.percent}%` } as CSSProperties}
              />
            </span>
            <span className="lazy-note">
              <strong>{lazy.title}</strong>: {lazy.percent}% of what is running can wait.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
