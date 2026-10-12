// Groups posts so that several small ones share a single Gemini request.
//
// The free tier limits REQUESTS per day, not text, and event notices are short
// (2k to 30k characters against 200k for patch notes). Sending eleven notices
// one by one costs eleven requests; packed, they cost two.

// Roughly 30k tokens of input. Small enough that the reply (a few items per
// post) stays well inside the model's output limit.
const DEFAULT_CHAR_BUDGET = 120_000;
// A cap on posts as well as size, so one bad reply cannot cost too many posts.
const DEFAULT_MAX_POSTS = 6;

interface Sized {
  text: string;
}

/**
 * Splits `jobs` into batches, keeping their order (the caller sorts by
 * priority). A post larger than the budget travels alone.
 */
export function planBatches<T extends Sized>(
  jobs: T[],
  charBudget = DEFAULT_CHAR_BUDGET,
  maxPosts = DEFAULT_MAX_POSTS,
): T[][] {
  const batches: { jobs: T[]; chars: number }[] = [];
  for (const job of jobs) {
    const size = job.text.length;
    // First fit: an earlier batch with room is topped up before a new one opens.
    const open = batches.find(
      (batch) => batch.jobs.length < maxPosts && batch.chars + size <= charBudget,
    );
    if (open) {
      open.jobs.push(job);
      open.chars += size;
    } else {
      batches.push({ jobs: [job], chars: size });
    }
  }
  return batches.map((batch) => batch.jobs);
}
