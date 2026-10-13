const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const ENDING_SOON = 3 * DAY;

export function formatRemaining(ms: number): string {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return "under 1h left";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface CountdownProps {
  /** When set and still in the future, the chip says when the quest opens. */
  startsAt?: string | null;
  endsAt: string | null;
  /** When rewards can still be claimed after the end, the last moment to do so. */
  claimUntil?: string | null;
  /** Current time in ms, or null before hydration. */
  now: number | null;
}

export function Countdown({ startsAt = null, endsAt, claimUntil = null, now }: CountdownProps) {
  // Not open yet: saying "29 days left" would send players to an event that
  // does not exist in the game today.
  if (now !== null && startsAt !== null && Date.parse(startsAt) > now) {
    return (
      <span className="chip chip-soon" title={`Starts ${formatDate(startsAt)} (UTC)`}>
        Starts {formatDate(startsAt)}
      </span>
    );
  }
  if (!endsAt) {
    return <span className="chip chip-quiet">Permanent</span>;
  }
  const date = formatDate(endsAt);
  // Before hydration there is no trustworthy clock, so show the date only.
  if (now === null) {
    return <span className="chip chip-quiet">Ends {date}</span>;
  }
  const remaining = Date.parse(endsAt) - now;
  if (remaining <= 0 && claimUntil !== null && Date.parse(claimUntil) > now) {
    // Over, but the rewards are still waiting.
    return (
      <span className="chip chip-urgent" title={`Claim by ${formatDate(claimUntil)} (UTC)`}>
        Claim by {formatDate(claimUntil)}
      </span>
    );
  }
  if (remaining <= 0) {
    return <span className="chip chip-quiet">Ended {date}</span>;
  }
  return (
    <span
      className={`chip ${remaining < ENDING_SOON ? "chip-urgent" : "chip-time"}`}
      title={`Ends ${date} (UTC)`}
    >
      {formatRemaining(remaining)}
    </span>
  );
}
