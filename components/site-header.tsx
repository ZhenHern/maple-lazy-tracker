import Link from "next/link";
import { PixelSprite } from "./pixel-sprite";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Quest Log" },
  { href: "/archive", label: "Archive" },
  { href: "/feedback", label: "Feedback" },
] as const;

/** The logo, the page links and the day / night switch, shared by every page. */
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
        <ThemeToggle />
      </nav>
    </header>
  );
}

// Where a rights holder can ask for content to be removed. A GitHub issue is
// public and dated, and needs no email address on the page.
const REMOVAL_URL = "https://github.com/ZhenHern/maple-lazy-tracker/issues/new";

export function SiteFooter() {
  return (
    <footer className="footnote">
      <p>
        Lazy Tracker is a free, non-commercial fan project. It is not affiliated with, endorsed
        by or sponsored by Nexon. Tiers and time estimates are AI-generated from the official
        patch notes and can be wrong.
      </p>
      <p className="mt-1.5">
        MapleStory and all game names, images and icons are trademarks or copyrights of Nexon,
        shown only to identify the events they belong to. Nothing here is sold, and every quest
        links to its official post. Rights holder and want something removed?{" "}
        <a href={REMOVAL_URL} className="underline" rel="noopener noreferrer" target="_blank">
          Tell us
        </a>{" "}
        and it will be taken down.
      </p>
      <p className="mt-1.5">
        Spotted a wrong rating or a bug?{" "}
        <Link href="/feedback" className="underline">
          Send feedback
        </Link>
        .
      </p>
    </footer>
  );
}
