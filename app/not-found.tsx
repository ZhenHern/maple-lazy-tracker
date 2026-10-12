import Link from "next/link";
import { PixelSprite } from "@/components/pixel-sprite";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";

// Shown for any URL that matches no page, and when a page calls notFound().
export default function NotFound() {
  return (
    <div className="page">
      <Scenery />
      <SiteHeader />
      <main>
        <section className="window">
          <h1 className="window-title">Map not found</h1>
          <div className="window-body">
            <div className="empty">
              <PixelSprite name="door" className="empty-sprite" />
              <p className="empty-title">This portal leads nowhere</p>
              <p>The page may have moved, or it never existed. No EXP was lost.</p>
              <p className="flex flex-wrap justify-center gap-2">
                <Link href="/" className="btn btn-go">
                  Back to the Quest Log
                </Link>
                <Link href="/archive" className="btn">
                  Browse the archive
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
