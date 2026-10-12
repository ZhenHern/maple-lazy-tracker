import type { CSSProperties } from "react";
import type { Tier } from "@/lib/types";
import { PixelSprite, type SpriteName } from "./pixel-sprite";

const GAUGES: { tier: Tier; label: string }[] = [
  { tier: "must_do", label: "Must Do" },
  { tier: "if_free", label: "If Free" },
  { tier: "skip", label: "Skip" },
];

interface StatusBarProps {
  job: { name: string; sprite: SpriteName };
  counts: Record<Tier, number>;
  active: Tier | "ended";
  onSelect: (tier: Tier) => void;
  /** Takes the visitor back up to the job picker. */
  onChangeJob: () => void;
}

/** The bar pinned to the bottom, like the in-game HP/MP/EXP bar. */
export function StatusBar({ job, counts, active, onSelect, onChangeJob }: StatusBarProps) {
  const total = counts.must_do + counts.if_free + counts.skip;

  return (
    <nav className="statusbar" aria-label="Jump to a tier">
      <div className="mx-auto flex w-full max-w-3xl items-stretch gap-1.5 sm:gap-3">
        <button
          type="button"
          className="statusbar-job"
          onClick={onChangeJob}
          aria-label={`Your job is ${job.name}. Change it.`}
          title="Change job"
        >
          <PixelSprite name={job.sprite} className="h-6 w-6 shrink-0" />
          <span className="hidden sm:block">{job.name}</span>
        </button>
        {GAUGES.map(({ tier, label }) => (
          <button
            key={tier}
            type="button"
            className={`statusbar-gauge tier-${tier}`}
            aria-current={active === tier ? "true" : undefined}
            onClick={() => onSelect(tier)}
          >
            <span className="flex items-baseline justify-between gap-1">
              <span className="truncate">{label}</span>
              <span>{counts[tier]}</span>
            </span>
            <span className="gauge">
              <span
                className="gauge-fill"
                style={
                  { "--fill": `${total === 0 ? 0 : (counts[tier] / total) * 100}%` } as CSSProperties
                }
              />
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
