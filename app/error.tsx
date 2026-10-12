"use client";

import { useEffect } from "react";

// An error boundary: if a page under app/ throws while rendering (for example
// the database is unreachable), Next.js shows this instead of a blank screen.
// It must be a Client Component, because recovering needs a click handler.
// `retry` fetches and renders the failed part of the page again.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The message stays in the console; visitors get a plain explanation.
    console.error(error);
  }, [error]);

  return (
    <div className="page">
      <section className="window">
        <h1 className="window-title">Connection lost</h1>
        <div className="window-body">
          <div className="empty">
            <p className="empty-title">The quest log could not be loaded</p>
            <p>This is on our side, not yours, and it is usually temporary.</p>
            <p>
              <button type="button" className="btn btn-go" onClick={() => retry()}>
                Try again
              </button>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
