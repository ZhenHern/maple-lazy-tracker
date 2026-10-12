"use client";

import type { TrackerItem } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useNow } from "@/lib/use-now";
import { PROFILE_INFO } from "./profile-picker";
import { QuestItem } from "./quest-item";
import { sanitizeProfile } from "./quest-log";

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

  const sorted = [...items].sort(byDeadline);
  const isOver = (item: TrackerItem) =>
    now !== null && item.endsAt !== null && Date.parse(item.endsAt) <= now;
  const running = sorted.filter((item) => !isOver(item));
  const ended = sorted.filter(isOver);

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Star ratings are shown for the <strong>{PROFILE_INFO[profile].name}</strong> job. Change it
        on the Quest Log page.
      </p>

      {running.length > 0 && (
        <section>
          <h3 className="label">Still running ({running.length})</h3>
          <ul className="grid gap-2">
            {running.map((item, index) => (
              <QuestItem key={item.id} item={item} profile={profile} now={now} index={index} />
            ))}
          </ul>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h3 className="label">Ended ({ended.length})</h3>
          <ul className="grid gap-2">
            {ended.map((item, index) => (
              <QuestItem key={item.id} item={item} profile={profile} now={now} index={index} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
