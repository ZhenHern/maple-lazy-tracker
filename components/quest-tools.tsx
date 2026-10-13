"use client";

import { useState } from "react";
import type { TrackerItem } from "@/lib/types";
import { closesAt } from "@/lib/tiering";
import { formatRemaining } from "./countdown";

// Two small helpers above the quest list: when the game's day rolls over, and
// a button that copies the Must Do list as text for a guild chat.

const DAY = 86_400_000;

/** Time until the next 00:00 UTC, when Global MapleStory's daily content resets. */
function untilDailyReset(now: number): number {
  return DAY - (now % DAY);
}

function resetText(now: number): string {
  const left = untilDailyReset(now);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  // The same moment on the visitor's own clock, so nobody has to convert UTC.
  const local = new Date(now + left).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${hours > 0 ? `${hours}h ` : ""}${minutes}m (${local} your time)`;
}

interface QuestToolsProps {
  mustDo: TrackerItem[];
  jobName: string;
  /** Daily playtime in minutes; 0 means no limit. */
  playtime: number;
  now: number | null;
}

export function QuestTools({ mustDo, jobName, playtime, now }: QuestToolsProps) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function copyList() {
    const lines = mustDo.map((item) => {
      const closes = closesAt(item);
      const left = now !== null && closes ? `, ${formatRemaining(Date.parse(closes) - now)}` : "";
      return `- ${item.title}${left}`;
    });
    const text = [
      `Must Do for a ${jobName}${playtime > 0 ? ` with ${playtime} min a day` : ""} (Lazy Tracker)`,
      ...lines,
      window.location.origin,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      // Clipboard access can be refused (old browser, no permission).
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className="quest-tools">
      <span className="chip chip-time" title="Daily quests and daily event limits reset at 00:00 UTC">
        {/* The clock is unknown until the page runs in the browser. */}
        Daily reset in {now === null ? "..." : resetText(now)}
      </span>
      {mustDo.length > 0 && (
        <button type="button" className="filter" onClick={copyList} aria-live="polite">
          {copied === "done"
            ? "Copied!"
            : copied === "failed"
              ? "Could not copy"
              : "Copy my Must Do list"}
        </button>
      )}
    </div>
  );
}
