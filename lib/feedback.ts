import { z } from "zod";

// One feedback message, as the form sends it and the server stores it. The
// same schema runs in both places: in the browser for instant hints, and on
// the server because nothing a browser sends can be trusted.

export const FEEDBACK_KINDS = ["rating", "bug", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, { name: string; hint: string }> = {
  rating: { name: "Wrong rating", hint: "A quest is in the wrong tier, or its facts are off" },
  bug: { name: "Bug", hint: "Something on the site is broken" },
  idea: { name: "Idea", hint: "Something the site should do" },
  other: { name: "Other", hint: "Anything else" },
};

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(MESSAGE_MIN).max(MESSAGE_MAX),
  // The quest or page the message is about, when the visitor came from one.
  about: z.string().trim().max(200).default(""),
  // Optional, and only used to reply. Not checked as an email: a Discord name is fine.
  contact: z.string().trim().max(120).default(""),
});

export type Feedback = z.infer<typeof feedbackSchema>;
