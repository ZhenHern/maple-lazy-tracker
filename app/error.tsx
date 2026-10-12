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
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-10">
      <section className="window">
        <h1 className="window-title">Connection lost</h1>
        <div className="window-body grid gap-3">
          <p>
            The quest log could not be loaded. This is on our side, not yours, and it is usually
            temporary.
          </p>
          <p>
            <button type="button" className="btn btn-go" onClick={() => retry()}>
              Try again
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
