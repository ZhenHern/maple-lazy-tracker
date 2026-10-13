"use client";

import type { ScheduleInfo } from "@/lib/ongoing";
import { useNow } from "@/lib/use-now";
import { PixelSprite } from "./pixel-sprite";

// A rotating schedule of perk days (Sunny Sunday), shown on its own instead of
// as a quest: there is nothing to do and nothing to rank, only days to plan
// around. A Client Component because "today", "next" and "over" depend on the
// visitor's clock, which the server does not know.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function dayName(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function clockText(time: number, timeZone?: string): string {
  return new Date(time).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function inText(ms: number): string {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h`;
  return "in under 1h";
}

function Perks({ perks }: { perks: string[] }) {
  return (
    <ul className="schedule-perks">
      {perks.map((perk) => (
        <li key={perk}>{perk}</li>
      ))}
    </ul>
  );
}

export function SchedulePanel({ schedule, builtAt }: { schedule: ScheduleInfo; builtAt: number }) {
  const clock = useNow();
  // Until the browser's clock is known, the time the page was built decides
  // which days are over, so the first render matches the server's.
  const now = clock ?? builtAt;

  const past = schedule.days.filter((day) => Date.parse(day.endsAt) <= now);
  const live = schedule.days.find(
    (day) => Date.parse(day.startsAt) <= now && Date.parse(day.endsAt) > now,
  );
  const ahead = schedule.days.filter((day) => Date.parse(day.startsAt) > now);
  const [next, ...later] = ahead;

  return (
    <section className="window" aria-label={schedule.title}>
      <h2 className="window-title">
        {schedule.title}
        <span className="window-note">Perk days, 00:00 to 23:59 UTC</span>
      </h2>
      <div className="window-body grid gap-3">
        <p className="schedule-now">
          <PixelSprite name="bulb" className="h-5 w-5 shrink-0" />
          <span>
            {clock === null ? (
              "Checking your clock..."
            ) : (
              <>
                Now: <strong>{clockText(clock)}</strong> your time ({clockText(clock, "UTC")} UTC)
              </>
            )}
          </span>
        </p>

        {live && (
          <div className="schedule-day schedule-live">
            <p className="schedule-date">
              {dayName(live.startsAt)}
              <span className="chip chip-live">Live now</span>
              <span className="chip chip-urgent">
                ends {inText(Date.parse(live.endsAt) - now)}
              </span>
            </p>
            <Perks perks={live.perks} />
          </div>
        )}

        {next ? (
          <div className={`schedule-day ${live ? "" : "schedule-next"}`}>
            <p className="schedule-date">
              {dayName(next.startsAt)}
              <span className="chip chip-soon">{live ? "After that" : "Next up"}</span>
              <span className="chip chip-time">
                starts {inText(Date.parse(next.startsAt) - now)}
                {clock !== null && ` (${clockText(Date.parse(next.startsAt))} your time)`}
              </span>
            </p>
            <Perks perks={next.perks} />
          </div>
        ) : (
          !live && <p className="text-sm">This schedule is over. The next patch brings a new one.</p>
        )}

        {later.length > 0 && (
          <details className="schedule-more">
            <summary>Later ({later.length})</summary>
            <div className="grid gap-2 pt-2">
              {later.map((day) => (
                <div key={day.startsAt} className="schedule-day">
                  <p className="schedule-date">{dayName(day.startsAt)}</p>
                  <Perks perks={day.perks} />
                </div>
              ))}
            </div>
          </details>
        )}

        {past.length > 0 && (
          <details className="schedule-more">
            <summary>Already over ({past.length})</summary>
            <div className="grid gap-2 pt-2">
              {/* Most recent first: the one you just missed is the one you look for. */}
              {[...past].reverse().map((day) => (
                <div key={day.startsAt} className="schedule-day schedule-past">
                  <p className="schedule-date">
                    {dayName(day.startsAt)}
                    <span className="chip chip-quiet">Over</span>
                  </p>
                  <Perks perks={day.perks} />
                </div>
              ))}
            </div>
          </details>
        )}

        <p className="text-xs text-ink-soft">
          From{" "}
          <a href={schedule.source.url} target="_blank" rel="noreferrer" className="underline">
            {schedule.source.title}
          </a>
          . The rotation changes with every patch.
        </p>
      </div>
    </section>
  );
}
