import { normalizeTitle } from "@/lib/images";
import type { ScoredItem } from "@/lib/types";
import { findDates, isGroundedDate, type TextDate } from "./dates";
import { eventPeriod } from "./rules";

// Checks a model's answer against the post it was given, in plain code.
//
// A model can return well-formed JSON that is still wrong: a date the post
// never mentions, a reward it made up, a coin shop listed as an event. Weaker
// models do this more often, and they are exactly the ones that answer when the
// quota runs out. These checks cost no AI calls and apply to every model.

interface GroundingInput {
  text: string;
  publishedAt: string;
  kind?: "patch" | "event";
}

export interface Grounded {
  items: ScoredItem[];
  /** What was corrected, for the ingest report and the stored post. */
  warnings: string[];
}

// Words in a reward that say nothing about which item it is.
const FILLER = new Set(["x", "the", "of", "a", "an", "and", "or", "to", "up", "for", "with", "per"]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !/^\d+$/.test(word) && !FILLER.has(word))
    // "Coupons" and "coupon" should match.
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

// A reward counts as real when most of its words appear in the post. Models
// shorten and reword names, so an exact match would reject honest answers.
const REWARD_MATCH = 0.6;

function isGroundedReward(reward: string, textWords: Set<string>): boolean {
  const wanted = words(reward);
  if (wanted.length === 0) return false;
  const found = wanted.filter((word) => textWords.has(word)).length;
  return found / wanted.length >= REWARD_MATCH;
}

// Every number written in a text, without thousands separators.
function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d[\d,]*/g) ?? []).map((value) => value.replace(/,/g, "")));
}

// Models like to add quantities up ("x30" three times becomes "x90"). A sum is
// not a fact from the post, and a player cannot check it. An amount that the
// post never writes is taken out; the reward's name stays.
// An amount as models write it: "(x30)", "(x500 per claim, 3x/week)", "x30",
// "30x". A bracket that opens with an amount is taken whole, so removing the
// amount never leaves half a bracket behind.
const AMOUNT = /\(\s*x\s?(\d[\d,]*)[^)]*\)|\(?\bx\s?(\d[\d,]*)\)?|\b(\d[\d,]*)\s?x\b/gi;

function tidyReward(reward: string): string {
  return reward
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;)])/g, "$1")
    // "x300 total" with the amount gone would read "... total".
    .replace(/[\s,]+(in\s+)?total\s*$/i, "")
    .trim();
}

function withoutInventedAmounts(reward: string, textNumbers: Set<string>): string {
  const cleaned = reward.replace(AMOUNT, (match, a, b, c) =>
    textNumbers.has(String(a ?? b ?? c).replace(/,/g, "")) ? match : "",
  );
  return cleaned === reward ? reward : tidyReward(cleaned);
}

// Models also move an amount from one reward to its neighbour ("Symbol
// Selector Coupon (x60)" becomes "Sol Erda Fragment (x60)"). Posts write
// amounts in two ways: beside the name on one line, or alone in a table cell
// far from it. So an amount stays when the post has that number on a line
// with the reward's name, or on a line with no name at all. It goes when the
// only places the number appears are lines about something else.
function withoutMisplacedAmounts(reward: string, flatText: string): string {
  const name = words(reward.replace(AMOUNT, " "));
  if (name.length === 0) return reward;
  const cleaned = reward.replace(AMOUNT, (match, a, b, c) => {
    const amount = String(a ?? b ?? c).replace(/,/g, "");
    const pattern = new RegExp(`(?<![\\d.])${amount}(?!\\d)`, "g");
    for (const found of flatText.matchAll(pattern)) {
      const lineStart = flatText.lastIndexOf("\n", found.index) + 1;
      const before = words(flatText.slice(lineStart, found.index));
      if (before.length === 0) return match;
      const shared = name.filter((word) => before.includes(word)).length;
      if (shared / name.length >= 0.5) return match;
    }
    return "";
  });
  return cleaned === reward ? reward : tidyReward(cleaned);
}

// A claim deadline is only real when the post talks about claiming next to
// that date. An item's expiry date ("expires November 11") is not one.
function isStatedClaimDate(iso: string, text: string, dates: TextDate[]): boolean {
  const day = Date.parse(iso);
  return dates.some((date) => {
    if (Math.abs(date.time - day) > DAY) return false;
    return /claim/i.test(text.slice(Math.max(0, date.index - 200), date.index + 60));
  });
}

const CHANCE = /^\s*(a\s+)?chance\s+(at|for|of)\b/i;
// A random draw is worth its usual result, however good the jackpot sounds.
const MAX_SCORE_FOR_A_DRAW = 80;

const EXP_COUPON = /\bexp coupons?\b/i;
const LEVEL_RANGE = /\b(\d{3})\s*-\s*(\d{3})\b/;
// From this level on a character is past every "catch-up" growth potion.
const SETTLED_LEVEL = 260;

// True when neither a Casual nor an Endgame character gets more out of the
// rewards than the other: EXP Coupons, which are worth the same to everyone,
// and growth potions whose level range ends below both of them.
function sameForSettledPlayers(rewards: string[]): boolean {
  return (
    rewards.length > 0 &&
    rewards.every((reward) => {
      if (EXP_COUPON.test(reward)) return true;
      const range = /growth potion/i.test(reward) ? LEVEL_RANGE.exec(reward) : null;
      return range !== null && Number(range[2]) < SETTLED_LEVEL;
    })
  );
}

// A reward that is progress on something else, not a thing to keep.
const PROGRESS_CURRENCY = /\b(exp|points?|stamps?|gauge)\s*$/i;
const GENERIC_CURRENCY =
  /^(character|bonus|weekly|monster park|passive|more|extra|massive|of|and|or|the|earn|gain|for|in)?\s*(exp|points?)$/i;

/** The progress currency a summary names ("designer exp"), or null. */
function currencyIn(summary: string): string | null {
  for (const match of summary.toLowerCase().matchAll(/\b[a-z]+ (?:exp|points?)\b/g)) {
    if (!GENERIC_CURRENCY.test(match[0])) return match[0];
  }
  return null;
}

// A rate a model attached to an amount: "500/week", "500 a day". "Per claim"
// is left alone: it is the plain reading of an amount and overstates nothing.
const RATE = /(\d[\d,]*)\s*(?:\/|per\s+|a\s+)\s*(week|day)\b/gi;

// "Up to 500" per completion, three completions a week, comes back as "up to
// 500/week": the number is real and the unit is invented, a factor of three
// off. A unit stays only when the post writes it after that number.
function withoutInventedRates(reward: string, flatText: string): string {
  return reward.replace(RATE, (match, amount: string, unit: string) => {
    const number = amount.replace(/,/g, "");
    const stated = new RegExp(`(?<![\\d.])${number}\\s*(?:/|per|a|each)\\s*${unit}`, "i");
    return stated.test(flatText) ? match : amount;
  });
}

/**
 * Folds an activity that only feeds a progress track into that track.
 *
 * The prompt asks for one item per track with its minigames as steps, and
 * models still return the minigames as an item of their own. The sign is
 * plain: the feeder's rewards name a progress currency ("Designer EXP") that
 * the track's summary says it runs on, and the track itself does not hand that
 * currency out. Counted twice, the same ten minutes fill a short day.
 */
function foldFeeders(items: ScoredItem[], warnings: string[]): ScoredItem[] {
  const result = items.map((item) => ({ ...item }));
  const removed = new Set<string>();

  for (const feeder of result) {
    let currency =
      feeder.rewards
        .map((reward) => reward.replace(/\(.*?\)|\bx\s?\d[\d,]*/gi, " ").trim().toLowerCase())
        .find((reward) => PROGRESS_CURRENCY.test(reward) && !GENERIC_CURRENCY.test(reward)) ?? null;
    let track = currency
      ? result.find(
          (other) =>
            other !== feeder &&
            !removed.has(other.id) &&
            other.endsAt !== null &&
            other.endsAt === feeder.endsAt &&
            other.summary.toLowerCase().includes(currency!) &&
            !other.rewards.some((reward) => reward.toLowerCase().includes(currency!)),
        )
      : undefined;

    // The same thing said another way: the item needs the track (the model
    // linked them) and its own summary says it earns the track's currency. An
    // AFK seat that pays out "Designer EXP" is a feeder like any minigame.
    if (!track && feeder.requires) {
      const gate = result.find((other) => other.id === feeder.requires && !removed.has(other.id));
      const named = gate ? currencyIn(gate.summary) : null;
      if (gate && named && feeder.summary.toLowerCase().includes(named)) {
        track = gate;
        currency = named;
      }
    }
    if (!track || !currency) continue;

    const own = feeder.rewards.filter((reward) => !reward.toLowerCase().includes(currency));
    const steps =
      feeder.steps.length > 0
        ? feeder.steps
        : [
            {
              name: feeder.title,
              what: feeder.summary,
              reward: own.join(", "),
              startsAt: feeder.startsAt === track.startsAt ? null : feeder.startsAt,
              endsAt: null,
            },
          ];
    const known = new Set(track.steps.map((step) => normalizeTitle(step.name)));
    track.steps = [...track.steps, ...steps.filter((step) => !known.has(normalizeTitle(step.name)))];
    // Chairs and outfits from the minigames are part of what the track offers.
    track.value = {
      ...track.value,
      limited: Math.max(track.value.limited, feeder.value.limited),
      cosmetic: Math.max(track.value.cosmetic, feeder.value.cosmetic),
    };
    removed.add(feeder.id);
    warnings.push(`"${feeder.title}": only feeds "${track.title}", folded into it as steps`);
    for (const other of result) {
      if (other.requires === feeder.id) other.requires = track.id;
    }
  }
  return result.filter((item) => !removed.has(item.id));
}

const DAY = 86_400_000;
const TIME_UNIT = /\b(sec|second|min|minute|hr|hour)s?\b/i;

// The prompt forbids these as items of their own: a shop is where an event's
// coins are spent, not something to do.
const SHOP_TITLE = /\bshop$/i;

export function groundItems(items: ScoredItem[], post: GroundingInput): Grounded {
  const warnings: string[] = [];
  const dates = findDates(post.text, post.publishedAt);
  const textWords = new Set(words(post.text));
  const textNumbers = numbersIn(post.text);
  // Lower case, thousands separators gone: "1,000" in the post is "1000" here.
  const flatText = post.text.toLowerCase().replace(/(\d),(?=\d{3})/g, "$1");

  const kept: ScoredItem[] = [];
  for (const item of items) {
    // Exact repeats only: "Operation: Dive" and "Operation: Dive Dungeon" are
    // different activities, so a shared prefix is not enough here.
    if (kept.some((existing) => normalizeTitle(existing.title) === normalizeTitle(item.title))) {
      warnings.push(`"${item.title}": duplicate item removed`);
      continue;
    }
    if (item.category === "event" && items.length > 1 && SHOP_TITLE.test(item.title.trim())) {
      warnings.push(`"${item.title}": a shop is not an item of its own, removed`);
      continue;
    }

    let { startsAt, endsAt, claimUntil, timeEstimate } = item;
    if (startsAt && !isGroundedDate(startsAt, dates, post.publishedAt)) {
      warnings.push(`"${item.title}": start date ${startsAt} is not in the post, cleared`);
      startsAt = null;
    }
    if (endsAt && !isGroundedDate(endsAt, dates, post.publishedAt)) {
      warnings.push(`"${item.title}": end date ${endsAt} is not in the post, cleared`);
      endsAt = null;
    }
    // A claim deadline only means something after an end date the post states.
    if (
      claimUntil &&
      (!endsAt ||
        Date.parse(claimUntil) <= Date.parse(endsAt) ||
        !isGroundedDate(claimUntil, dates, post.publishedAt) ||
        !isStatedClaimDate(claimUntil, post.text, dates))
    ) {
      warnings.push(`"${item.title}": claim deadline ${claimUntil} is not usable, cleared`);
      claimUntil = null;
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      warnings.push(`"${item.title}": ends before it starts, start date cleared`);
      startsAt = null;
    }

    const rewards = item.rewards
      .filter((reward) => {
        const grounded = isGroundedReward(reward, textWords);
        if (!grounded) {
          warnings.push(`"${item.title}": reward "${reward}" is not in the post, removed`);
        }
        return grounded;
      })
      .map((reward) => {
        const cleaned = withoutInventedRates(
          withoutMisplacedAmounts(withoutInventedAmounts(reward, textNumbers), flatText),
          flatText,
        );
        if (cleaned !== reward) {
          warnings.push(`"${item.title}": amount in "${reward}" is not in the post, removed`);
        }
        return cleaned;
      });

    // "1,000 monsters/day" is a quantity, not a duration. Without a unit of
    // time the estimate is not one a player can plan with.
    if (timeEstimate && timeEstimate.basis !== "uncertain" && !TIME_UNIT.test(timeEstimate.label)) {
      warnings.push(`"${item.title}": time estimate "${timeEstimate.label}" has no duration, marked uncertain`);
      timeEstimate = { ...timeEstimate, basis: "uncertain", minutesPerWeek: null, effort: null };
    }

    // A system change, or anything with no deadline, is news: a quality-of-life
    // change takes no play time, and an estimate on it would only mislead.
    const news = item.category === "system" || endsAt === null;
    if (news) timeEstimate = null;

    // Taking part in an event always costs some time. A model that leaves the
    // estimate out has skipped the question, not answered "none".
    if (!timeEstimate && item.category === "event" && !news) {
      warnings.push(`"${item.title}": no time estimate given, marked uncertain`);
      timeEstimate = {
        label: "Not stated in the post",
        minutesPerWeek: null,
        effort: null,
        basis: "uncertain",
      };
    }

    // A step is held to the same standard as the quest: its name and its
    // reward must come from the post, and so must any amount or date in it.
    const steps = item.steps
      .filter((step) => {
        const grounded = isGroundedReward(step.name, textWords);
        if (!grounded) warnings.push(`"${item.title}": step "${step.name}" is not in the post, removed`);
        return grounded;
      })
      .map((step) => {
        let reward = step.reward.trim();
        if (reward && !isGroundedReward(reward, textWords)) {
          warnings.push(`"${item.title}": step reward "${reward}" is not in the post, removed`);
          reward = "";
        }
        const stated = (date: string | null) =>
          date && isGroundedDate(date, dates, post.publishedAt) ? date : null;
        return {
          ...step,
          reward: withoutInventedAmounts(reward, textNumbers),
          startsAt: stated(step.startsAt),
          endsAt: stated(step.endsAt),
        };
      });

    let value = item.value;
    // A draw: the score may not be the jackpot's. Models do not prefix every
    // prize with "Chance at", so half the list is enough, or one such prize
    // in an item whose summary calls itself random.
    const draws = rewards.filter((reward) => CHANCE.test(reward)).length;
    const isDraw =
      draws > 0 &&
      (draws * 2 >= rewards.length || /\brandom\b|\bgacha\b|\blottery\b|\braffle\b/i.test(item.summary));
    if (isDraw) {
      const { casual, endgame, returning } = value.progression;
      if (Math.max(casual, endgame, returning) > MAX_SCORE_FOR_A_DRAW) {
        warnings.push(`"${item.title}": every reward is a draw, scores capped at ${MAX_SCORE_FOR_A_DRAW}`);
        value = {
          ...value,
          progression: {
            casual: Math.min(casual, MAX_SCORE_FOR_A_DRAW),
            endgame: Math.min(endgame, MAX_SCORE_FOR_A_DRAW),
            returning: Math.min(returning, MAX_SCORE_FOR_A_DRAW),
          },
        };
      }
    }
    if (sameForSettledPlayers(rewards) && value.progression.endgame !== value.progression.casual) {
      warnings.push(`"${item.title}": rewards are worth the same at 260+, Endgame set to Casual's score`);
      value = { ...value, progression: { ...value.progression, endgame: value.progression.casual } };
    }

    // "2,500 a week, at most 500 a day" is five days. Both numbers must be
    // in the post; then the division is ours, not the model's.
    let daysPerWeek = item.daysPerWeek;
    const { weeklyTarget, dailyCap } = item;
    if (
      weeklyTarget &&
      dailyCap &&
      weeklyTarget >= dailyCap &&
      textNumbers.has(String(weeklyTarget)) &&
      textNumbers.has(String(dailyCap))
    ) {
      const days = Math.min(7, Math.ceil(weeklyTarget / dailyCap));
      if (days !== daysPerWeek) {
        warnings.push(
          `"${item.title}": ${weeklyTarget} a week at ${dailyCap} a day is ${days} days a week, not ${daysPerWeek}`,
        );
        daysPerWeek = days;
      }
    }

    kept.push({
      ...item,
      value,
      daysPerWeek,
      startsAt,
      endsAt,
      claimUntil,
      rewards,
      steps,
      timeEstimate,
    });
  }
  const folded = foldFeeders(kept, warnings);
  kept.length = 0;
  kept.push(...folded);
  // A notice about a single event states its period outright, and code reads
  // that more reliably than a model does (models sometimes copy the Pacific
  // time as if it were UTC). When the two ends are within a day of each other
  // they mean the same moment, so the stated one wins.
  if (post.kind === "event" && kept.length === 1) {
    const [only] = kept;
    const stated = eventPeriod(post).endsAt;
    if (stated && only.endsAt) {
      const gap = Math.abs(Date.parse(stated) - Date.parse(only.endsAt));
      if (gap > 0 && gap <= DAY) {
        warnings.push(`"${only.title}": end time ${only.endsAt} aligned to the stated ${stated}`);
        kept[0] = { ...only, endsAt: stated };
      }
    }
  }
  return { items: kept, warnings };
}
