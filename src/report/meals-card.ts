// The Food tab's Meals card: today's meals as the coach estimated them
// (Coach/meals.json) with the day added up, and the meals waiting for its
// estimate (Coach/Inbox/meals/, Pahlavan's meal form). Every number is the
// coach's estimate, shown with "about"; where the eating-history screen
// ruled counting out, the card names the meals and shows no numbers. Pure:
// the caller reads the files.

import type { Counting, IsoDate, MealEntry } from '../core/schema.ts';
import type { PendingRead } from './meal-pending.ts';
import { dayTotals, readMeals, type DayTotals } from './meal-write.ts';

export interface MealsCardMeal {
  id: string;
  at: string | null;
  name: string;
  proteinG: number;
  kcal: number | null;
  confidence: MealEntry['confidence'];
}

export interface MealsCardWaiting {
  id: string;
  date: IsoDate;
  at: string | null;
  /** The user's words, or null for a photo alone. */
  text: string | null;
  photo: boolean;
  /** False when the photo isn't on this Mac (photos stay out of git). */
  photoFound: boolean;
}

export interface MealsCard {
  date: IsoDate;
  /** The eating plan's counting (null: no eating plan); "none" shows no numbers. */
  counting: Counting | null;
  meals: MealsCardMeal[];
  /** The day's totals, null when no meal is recorded for it. */
  totals: DayTotals | null;
  /** The day's protein goal (the Protein item's grams, else the eating plan's floor), or null. */
  goalG: number | null;
  /** Waiting for the coach, oldest day first. */
  waiting: MealsCardWaiting[];
  /** What couldn't be read, in words (meals.json invalid, a waiting file refused). */
  problems: string[];
}

/** The card for `date`, from meals.json as it is and the waiting meals as read. */
export function buildMealsCard(input: { mealsText: string | null; pending: PendingRead; date: IsoDate; counting: Counting | null; goalG: number | null }): MealsCard {
  const m = readMeals(input.mealsText);
  const day = m.meals.filter((x) => x.date === input.date);
  const problems: string[] = [];
  if (m.error) problems.push(m.error.message);
  for (const r of input.pending.refused) problems.push(`${r.file} is not a waiting meal: ${r.reason}`);
  return {
    date: input.date,
    counting: input.counting,
    meals: day.map((x) => ({ id: x.id, at: x.at ?? null, name: x.name, proteinG: x.estimate.proteinG, kcal: x.estimate.kcal ?? null, confidence: x.confidence })),
    totals: day.length ? dayTotals(m.meals, input.date) : null,
    goalG: input.goalG,
    waiting: input.pending.meals.map((p) => ({ id: p.id, date: p.entry.date, at: p.entry.at ?? null, text: p.entry.text ?? null, photo: p.photo !== null, photoFound: p.photoFound })),
    problems,
  };
}
