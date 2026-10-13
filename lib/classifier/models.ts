// Which Gemini models we may call, and which of them we trust.
//
// "Primary" models give ratings good enough to publish as they are. "Fallback"
// models are smaller and noticeably less accurate, so their results are marked
// provisional and replaced as soon as a primary model has quota again.

// The free quota is counted per model, so every extra trusted model is extra
// daily capacity. gemini-3-flash-preview is an older Flash generation that
// still rates far better than the Lite fallback, and it answered on days when
// the three newer ones were out of quota.
const DEFAULT_PRIMARY =
  "gemini-3.6-flash,gemini-3.8-flash,gemini-3.7-flash,gemini-3-flash-preview";
const DEFAULT_FALLBACK = "gemini-3.5-flash-lite";

/** Recorded as the "model" of an item that was built by code, with no AI rating. */
export const RULES_MODEL = "rules";

function parseList(value: string | undefined, fallback: string): string[] {
  return (value || fallback)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

/** Models whose results are provisional. GEMINI_FALLBACK_MODEL, comma-separated. */
export function fallbackModels(): string[] {
  return parseList(process.env.GEMINI_FALLBACK_MODEL, DEFAULT_FALLBACK);
}

/**
 * Models to try first, in order. GEMINI_MODEL, comma-separated. A model that is
 * also listed as a fallback is left out, unless that would leave nothing.
 */
export function primaryModels(): string[] {
  const all = parseList(process.env.GEMINI_MODEL, DEFAULT_PRIMARY);
  const fallback = new Set(fallbackModels());
  const primary = all.filter((model) => !fallback.has(model));
  return primary.length > 0 ? primary : all;
}

/** How much a stored result can be trusted, judged by the model that produced it. */
export type Rating = "ai" | "backup" | "unrated";

export function ratingOf(model: string): Rating {
  if (model === RULES_MODEL) return "unrated";
  return primaryModels().includes(model) ? "ai" : "backup";
}

/** True when a result should be redone once a primary model is available. */
export function isProvisional(model: string): boolean {
  return ratingOf(model) !== "ai";
}
