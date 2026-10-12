import Link from "next/link";
import { PixelSprite } from "./pixel-sprite";

const LINKS = [
  { href: "/", label: "Quest Log" },
  { href: "/archive", label: "Archive" },
] as const;

/** The logo and the two-page navigation, shared by every page. */
export function SiteHeader({ current }: { current?: (typeof LINKS)[number]["href"] }) {
  return (
    <header className="site-header">
      {/* Link navigates without a full page reload, and prefetches the target. */}
      <Link href="/" className="flex items-center gap-2.5 sm:gap-3">
        <PixelSprite name="leaf" className="logo-leaf h-11 w-11 shrink-0 sm:h-14 sm:w-14" />
        <div>
          <p className="logo text-[2rem] leading-none sm:text-5xl">Lazy Tracker</p>
          <p className="tagline">Play less. Miss nothing.</p>
        </div>
      </Link>

      <nav className="flex gap-2" aria-label="Pages">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="filter nav-link"
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
