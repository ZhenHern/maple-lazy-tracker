"use client";

import Link from "next/link";
import type { TrackerItem } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { closesAt, isTask } from "@/lib/tiering";
import { useNow } from "@/lib/use-now";
import { PixelSprite } from "./pixel-sprite";
import { PROFILE_INFO } from "./profile-picker";
import { QuestItem } from "./quest-item";
import { mostlyRough, RoughNotice, sanitizeProfile } from "./quest-log";

// The quests of one archived post. A Client Component because the ratings
// shown depend on the visitor's job, which lives in their browser's
// localStorage, and the countdowns depend on their clock.

// Soonest deadline first; items with no end date go last.
function byDeadline(a: TrackerItem, b: TrackerItem): number {
  return (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999");
}

export function ArchiveLog({ items }: { items: TrackerItem[] }) {
  const [profile] = useLocalStorage("lazy-tracker:profile", sanitizeProfile);
  const now = useNow();
  const job = PROFILE_INFO[profile];

  const sorted = [...items].sort(byDeadline);
  const isOver = (item: TrackerItem) => {
    const closes = closesAt(item);
    return now !== null && closes !== null && Date.parse(closes) <= now;
  };
  // Changes with no deadline are news: listed apart, without tier or time.
  const tasks = sorted.filter(isTask);
  const news = sorted.filter((item) => !isTask(item));
  const running = tasks.filter((item) => !isOver(item));
  const ended = tasks.filter(isOver);
  const rough = mostlyRough(items);

  if (items.length === 0) {
    return (
      <div className="empty">
        <PixelSprite name="bulb" className="empty-sprite" />
        <p className="empty-title">No quests in this post</p>
        <p>Nothing in it could be sorted into quests. The official post has the details.</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${rough ? "ratings-rough" : ""}`}>
      <p className="job-note">
        <PixelSprite name={job.sprite} className="h-6 w-6 shrink-0" />
        <span>
          Ratings are shown for the <strong>{job.name}</strong> job.{" "}
          <Link href="/" className="underline">
            Change it on the Quest Log
          </Link>
          .
        </span>
      </p>

      {rough && <RoughNotice items={items} />}

      {running.length > 0 && (
        <section className="tab-panel tier-if_free">
          <h3 className="label">Still running ({running.length})</h3>
          <ul className="grid gap-2">
            {running.map((item, index) => (
              <QuestItem key={item.id} item={item} profile={profile} now={now} index={index} />
            ))}
          </ul>
        </section>
      )}

      {ended.length > 0 && (
        <section className="tab-panel tier-ended">
          <h3 className="label">Ended ({ended.length})</h3>
          <ul className="grid gap-2">
            {ended.map((item, index) => (
              <QuestItem key={item.id} item={item} profile={profile} now={now} index={index} />
            ))}
          </ul>
        </section>
      )}

      {news.length > 0 && (
        <section className="tab-panel tier-ended">
          <h3 className="label">What changed, nothing to do ({news.length})</h3>
          <ul className="grid gap-2">
            {news.map((item, index) => (
              <QuestItem key={item.id} item={item} profile={profile} now={now} index={index} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
