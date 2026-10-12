import Link from "next/link";
import { PixelSprite } from "./pixel-sprite";

const LINKS = [
  { href: "/", label: "Quest Log" },
  { href: "/archive", label: "Archive" },
] as const;

/** The logo and the two-page navigation, shared by every page. */
export function SiteHeader({ current }: { current?: (typeof LINKS)[number]["href"] }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {/* Link navigates without a full page reload, and prefetches the target. */}
      <Link href="/" className="flex items-center gap-3">
        <PixelSprite name="leaf" className="logo-leaf h-14 w-14 shrink-0" />
        <div>
          <p className="logo text-4xl leading-none sm:text-5xl">Lazy Tracker</p>
          <p className="tagline">Play less. Miss nothing.</p>
        </div>
      </Link>

      <nav className="flex gap-2" aria-label="Pages">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="filter"
            aria-current={current === href ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footnote">
      Fan project, not affiliated with Nexon. Tiers and time estimates are AI-generated from the
      official patch notes and can be wrong. MapleStory and all related images belong to Nexon.
    </footer>
  );
}
