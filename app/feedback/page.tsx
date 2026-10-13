import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedbackForm } from "@/components/feedback-form";
import { Scenery } from "@/components/scenery";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Report a wrong rating or a bug on Lazy Tracker, or suggest an idea.",
};

export default function FeedbackPage() {
  return (
    <div className="page">
      <Scenery />
      <SiteHeader current="/feedback" />

      <main>
        <section className="window">
          <h1 className="window-title">
            Feedback
            <span className="window-note">Wrong rating? Bug? Idea?</span>
          </h1>
          <div className="window-body grid gap-4">
            <p className="text-sm">
              The ratings are made by an AI reading the official posts, and it gets things wrong.
              If a quest is in the wrong tier for your kind of player, say so here: that is the
              most useful message you can send.
            </p>
            {/* The form reads the address bar (?about=...), which only exists in
                the browser, so the page shell is sent first and the form follows. */}
            <Suspense fallback={<div className="skeleton" />}>
              <FeedbackForm />
            </Suspense>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
