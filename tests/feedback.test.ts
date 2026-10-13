import { describe, expect, it } from "vitest";
import { feedbackSchema, MESSAGE_MAX } from "@/lib/feedback";

describe("feedbackSchema", () => {
  it("accepts a message and fills in the optional fields", () => {
    const parsed = feedbackSchema.parse({ kind: "rating", message: "  Sauna should be If Free.  " });
    expect(parsed).toEqual({ kind: "rating", message: "Sauna should be If Free.", about: "", contact: "" });
  });

  it("refuses an unknown kind, a message that is too short, and one that is too long", () => {
    expect(feedbackSchema.safeParse({ kind: "spam", message: "A long enough message." }).success).toBe(false);
    expect(feedbackSchema.safeParse({ kind: "bug", message: "short" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ kind: "bug", message: "x".repeat(MESSAGE_MAX + 1) }).success).toBe(false);
  });

  it("drops fields the form does not have", () => {
    const parsed = feedbackSchema.parse({ kind: "idea", message: "Add a boss tracker please.", handled: true });
    expect(parsed).not.toHaveProperty("handled");
  });
});
