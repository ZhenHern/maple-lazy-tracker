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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface CountdownProps {
  endsAt: string | null;
  /** Current time in ms, or null before hydration. */
  now: number | null;
}

export function Countdown({ endsAt, now }: CountdownProps) {
  if (!endsAt) {
    return <span className="chip chip-quiet">Permanent</span>;
  }
  const date = formatDate(endsAt);
  // Before hydration there is no trustworthy clock, so show the date only.
  if (now === null) {
    return <span className="chip chip-quiet">Ends {date}</span>;
  }
  const remaining = Date.parse(endsAt) - now;
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
