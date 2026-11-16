// The coach's write path into Coach/meals.json (`engine meal`): a meal the
// coach estimated from a photo or a description, added after the user's
// yes, or one taken out. The numbers are the coach's estimates (`by:
// coach`); the engine checks the record's shape and bounds, keeps the file
// in order and adds up each day. No Node APIs: the CLI passes the texts in
// and does the writes itself.

import type { VaultWarning } from '../adapters/vault/convert.ts';
import { SCHEMA_VERSION, type Counting, type IsoDate, type MealEntry, type MealEstimate, type MealsFile } from '../core/schema.ts';
import { canWrite, validateMeals } from '../core/validate.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The numbers past protein, which only a vault whose eating-history screen allows counting records. */
export const COUNTED: readonly (keyof MealEstimate)[] = ['kcal', 'fiberG', 'fatG', 'carbsG'];

/** A day's meals added up: each number over the meals that give it, with how many gave it. */
export interface DayTotals {
  date: IsoDate;
  meals: number;
  proteinG: number;
  kcal: number | null;
  fiberG: number | null;
  fatG: number | null;
  carbsG: number | null;
  /** The numbers some of the day's meals leave out (their totals count the rest). */
  partial: (keyof MealEstimate)[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** One day's meals and their totals, the meals in the file's order. */
export function dayTotals(meals: readonly MealEntry[], date: IsoDate): DayTotals {
  const day = meals.filter((m) => m.date === date);
  const sum = (k: keyof MealEstimate) => {
    const given = day.filter((m) => typeof m.estimate[k] === 'number');
    return { total: given.length ? r1(given.reduce((a, m) => a + (m.estimate[k] as number), 0)) : null, missing: given.length > 0 && given.length < day.length };
  };
  const out: DayTotals = { date, meals: day.length, proteinG: sum('proteinG').total ?? 0, kcal: null, fiberG: null, fatG: null, carbsG: null, partial: [] };
  for (const k of COUNTED) {
    const s = sum(k);
    out[k as 'kcal'] = s.total;
    if (s.missing) out.partial.push(k);
  }
  return out;
}

/** The file as written: meals by date, then time (a meal with no time first), then id. */
function ordered(meals: readonly MealEntry[]): MealEntry[] {
  return [...meals].sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id));
}

const text = (doc: MealsFile) => `${JSON.stringify(doc, null, 2)}\n`;

/** The meal's content without its id, to tell a meal sent twice from a second meal at the same time. */
const sameMeal = (a: MealEntry, b: Omit<MealEntry, 'id'>) => {
  const { id: _a, ...x } = a;
  return JSON.stringify(x) === JSON.stringify({ ...b });
};

/** The existing file read for a write: its meals, or why it can't be written. */
function existing(textNow: string | null): { doc: MealsFile | null; error: VaultWarning | null } {
  if (textNow === null) return { doc: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(textNow);
  } catch (e) {
    return { doc: null, error: { code: 'meals', message: `Coach/meals.json is not valid JSON (${(e as Error).message}): fix it before adding a meal.` } };
  }
  const guard = canWrite(parsed);
  if (!guard.value) return { doc: null, error: { code: 'meals', message: `Coach/meals.json: ${guard.reason.note}` } };
  const errs = validateMeals(parsed);
  if (errs.length) return { doc: null, error: { code: 'meals', message: `Coach/meals.json is not valid (${errs.map((e) => `${e.path}: ${e.message}`).join('; ')}): fix it before adding a meal.` } };
  return { doc: parsed as MealsFile, error: null };
}

export interface MealAddPlan {
  errors: VaultWarning[];
  warnings: VaultWarning[];
  /** added: a new meal; already: the same meal is in the file (nothing to write). */
  action: 'added' | 'already' | null;
  meal: MealEntry | null;
  doc: MealsFile | null;
  /** What to write; null on an error or when the meal is there already. */
  text: string | null;
}

/**
 * A meal to add: the given meal (its id made from its date and time when it
 * has none, `by` filled in), checked and placed in the file. Refused: a date
 * after today, and any number past protein when the eating plan's screen
 * ruled counting out.
 */
export function planMealAdd(input: { existingText: string | null; given: unknown; today: IsoDate; counting: Counting | null }): MealAddPlan {
  const fail = (code: string, message: string): MealAddPlan => ({ errors: [{ code, message }], warnings: [], action: null, meal: null, doc: null, text: null });
  if (!isObj(input.given)) return fail('meal', 'The meal file holds no object: give one meal as a JSON object.');
  const now = existing(input.existingText);
  if (now.error) return { ...fail(now.error.code, now.error.message) };
  const meals = now.doc?.meals ?? [];
  const g = input.given;
  if (typeof g['date'] === 'string' && g['date'] > input.today) return fail('meal', `The meal's date (${g['date']}) is after today (${input.today}).`);
  if (input.counting === 'none' && isObj(g['estimate'])) {
    const counted = COUNTED.filter((k) => g['estimate'] !== undefined && (g['estimate'] as Obj)[k] !== undefined);
    if (counted.length) return fail('counting-none', `The eating plan's screen ruled counting out, so a meal records protein only: leave out ${counted.join(', ')}.`);
  }
  const { id: givenId, ...rest } = g;
  const body = { ...rest, by: 'coach' } as Omit<MealEntry, 'id'>;
  const same = meals.find((m) => sameMeal(m, body));
  if (same) return { errors: [], warnings: [], action: 'already', meal: same, doc: now.doc, text: null };
  let id = typeof givenId === 'string' ? givenId : `${String(g['date'] ?? '')}-${typeof g['at'] === 'string' ? g['at'].replace(':', '') : 'meal'}`;
  if (typeof givenId === 'string' && meals.some((m) => m.id === givenId)) return fail('meal', `A meal with the id ${givenId} is there already, with other content: give another id, or leave the id out.`);
  if (typeof givenId !== 'string') for (let n = 2; meals.some((m) => m.id === id); n++) id = `${String(g['date'])}-${typeof g['at'] === 'string' ? g['at'].replace(':', '') : 'meal'}-${n}`;
  const meal = { id, ...body } as MealEntry;
  const doc: MealsFile = { schemaVersion: SCHEMA_VERSION, meals: ordered([...meals, meal]) };
  const errs = validateMeals(doc);
  if (errs.length) {
    const i = doc.meals.indexOf(meal);
    const own = errs.filter((e) => e.path.startsWith(`meals[${i}]`)).map((e) => ({ code: 'schema', message: `the meal ${e.path.replace(`meals[${i}]`, '').replace(/^\./, '') || '(the meal)'}: ${e.message}` }));
    return { errors: own.length ? own : errs.map((e) => ({ code: 'schema', message: `${e.path}: ${e.message}` })), warnings: [], action: null, meal: null, doc: null, text: null };
  }
  const warnings: VaultWarning[] = [];
  if (meal.confidence === 'low') warnings.push({ code: 'low-confidence', message: 'A low-confidence estimate: say what it assumed (the note), and that a portion or the oil would change it most.' });
  return { errors: [], warnings, action: 'added', meal, doc, text: text(doc) };
}

/** A meal to take out by its id; the day's Protein tick stays as it is (the user unticks it if it no longer holds). */
export function planMealDelete(input: { existingText: string | null; id: string }): { errors: VaultWarning[]; action: 'deleted' | null; meal: MealEntry | null; doc: MealsFile | null; text: string | null } {
  const fail = (code: string, message: string) => ({ errors: [{ code, message }], action: null, meal: null, doc: null, text: null });
  const now = existing(input.existingText);
  if (now.error) return fail(now.error.code, now.error.message);
  const meal = now.doc?.meals.find((m) => m.id === input.id) ?? null;
  if (!now.doc || !meal) return fail('not-found', `No meal with the id ${input.id}: \`meal show --date <D>\` lists a day's meals with their ids.`);
  const doc: MealsFile = { schemaVersion: SCHEMA_VERSION, meals: now.doc.meals.filter((m) => m.id !== input.id) };
  return { errors: [], action: 'deleted', meal, doc, text: text(doc) };
}

/** Whether the file now on disk holds the meal (or, with `gone`, no longer holds its id). */
export function mealLanded(textNow: string | null, id: string, gone = false): boolean {
  if (textNow === null) return gone;
  try {
    const doc = JSON.parse(textNow) as MealsFile;
    const has = Array.isArray(doc.meals) && doc.meals.some((m) => m.id === id);
    return gone ? !has : has && validateMeals(doc).length === 0;
  } catch {
    return false;
  }
}

/** The meals file as read for `meal show`: its meals, or the reason it can't be read. */
export function readMeals(textNow: string | null): { meals: MealEntry[]; state: 'found' | 'missing' | 'invalid'; error: VaultWarning | null } {
  if (textNow === null) return { meals: [], state: 'missing', error: null };
  const now = existing(textNow);
  if (now.error) return { meals: [], state: 'invalid', error: now.error };
  return { meals: now.doc!.meals, state: 'found', error: null };
}
