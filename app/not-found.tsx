import Link from "next/link";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";

// Shown for any URL that matches no page, and when a page calls notFound().
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 sm:pt-10">
      <Scenery />
      <SiteHeader />
      <main>
        <section className="window">
          <h1 className="window-title">Map not found</h1>
          <div className="window-body grid gap-3">
            <p>This portal leads nowhere. The page may have moved, or it never existed.</p>
            <p>
              <Link href="/" className="btn btn-go">
                Back to the Quest Log
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
