"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  MESSAGE_MAX,
  MESSAGE_MIN,
  type FeedbackKind,
} from "@/lib/feedback";
import { PixelSprite } from "./pixel-sprite";

// The feedback form. A Client Component because it holds what the visitor is
// typing and sends it without leaving the page.

type Status = { state: "idle" | "sending" | "sent" } | { state: "failed"; reason: string };

export function FeedbackForm() {
  // A quest card links here with "?about=<its title>", so the message arrives
  // already saying which quest it is about.
  const about = useSearchParams().get("about")?.slice(0, 200) ?? "";
  const [kind, setKind] = useState<FeedbackKind>(about ? "rating" : "bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const tooShort = message.trim().length < MESSAGE_MIN;

  async function send(event: FormEvent<HTMLFormElement>) {
    // Without this the browser would reload the page to submit the form.
    event.preventDefault();
    if (tooShort || status.state === "sending") return;
    setStatus({ state: "sending" });
    const website = new FormData(event.currentTarget).get("website");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, about, contact, website }),
      });
      if (response.ok) {
        setStatus({ state: "sent" });
        setMessage("");
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus({ state: "failed", reason: body?.error ?? "Something went wrong." });
    } catch {
      setStatus({ state: "failed", reason: "No connection. Please try again." });
    }
  }

  if (status.state === "sent") {
    return (
      <div className="empty" role="status">
        <PixelSprite name="shroom" className="empty-sprite" />
        <p className="empty-title">Got it, thank you!</p>
        <p>Your message is on the notice board. Reports about wrong ratings are read first.</p>
        <p className="flex flex-wrap justify-center gap-2">
          <Link href="/" className="btn btn-go">
            Back to the Quest Log
          </Link>
          <button type="button" className="btn" onClick={() => setStatus({ state: "idle" })}>
            Send another
          </button>
        </p>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={send}>
      {about && (
        <p className="job-note">
          <PixelSprite name="bulb" className="h-6 w-6 shrink-0" />
          <span>
            About: <strong>{about}</strong>
          </span>
        </p>
      )}

      <fieldset>
        <legend className="label">What is it about?</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
          {FEEDBACK_KINDS.map((each) => (
            <button
              key={each}
              type="button"
              className="pick pick-time"
              aria-pressed={each === kind}
              onClick={() => setKind(each)}
            >
              <span className="pick-name">{FEEDBACK_KIND_LABEL[each].name}</span>
              <span className="pick-hint max-sm:sr-only">{FEEDBACK_KIND_LABEL[each].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1.5">
        <span className="label mb-0">Your message</span>
        <textarea
          className="search feedback-text"
          name="message"
          rows={6}
          maxLength={MESSAGE_MAX}
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            kind === "rating"
              ? "Which quest, which job, and where should it be? For example: Sauna is Must Do for Endgame, but it is AFK time, so If Free at most."
              : "What happened, and what did you expect?"
          }
        />
        <span className="text-xs text-ink-soft">
          {message.length} / {MESSAGE_MAX}
        </span>
      </label>

      <label className="grid gap-1.5">
        <span className="label mb-0">How to reach you (optional)</span>
        <input
          className="search"
          name="contact"
          maxLength={120}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="Discord name or email, only if you want a reply"
          autoComplete="off"
        />
      </label>

      {/* Hidden from people and screen readers; only a bot fills it in. */}
      <input
        className="feedback-trap"
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {status.state === "failed" && (
        <p className="rough-notice" role="alert">
          {status.reason}
        </p>
      )}

      <p className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="btn btn-go"
          disabled={tooShort || status.state === "sending"}
        >
          {status.state === "sending" ? "Sending..." : "Send"}
        </button>
        <span className="text-xs text-ink-soft">
          No account needed. Only what you type here is saved, plus your browser type.
        </span>
      </p>
    </form>
  );
}
