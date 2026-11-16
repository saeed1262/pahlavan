// Meals waiting for the coach's estimate, in Coach/Inbox/meals/: what
// Pahlavan's meal form saves, and how the plugin and the engine read the
// folder. A waiting meal holds the user's own words and a photo, never a
// number; the coach estimates it and records it with `meal add --pending
// <id>`, which then removes the file and its photo. The folder sits inside
// the inbox, where neither importer looks (they read the inbox's own files
// only), and its .gitignore keeps the photos out of a git-backed vault's
// history. Pure: the callers read, write and remove.

import { isIsoDate } from '../core/dates.ts';
import { PENDING_MEAL_VERSION, type IsoDate, type PendingMeal } from '../core/schema.ts';
import { PENDING_MEAL_FILE, PENDING_MEAL_PHOTO, PENDING_TEXT_MAX, validatePendingMeal } from '../core/validate.ts';

/** The photo kinds the coach can read (Claude Code reads these; a HEIC is converted first, or refused). */
export const PENDING_PHOTO_EXTS = ['jpeg', 'jpg', 'png', 'webp', 'gif'] as const;
export type PendingPhotoExt = (typeof PENDING_PHOTO_EXTS)[number];

/** A waiting meal's id: the moment the form saved it, with a counter on a clash. */
export const PENDING_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d+)?$/;

export const PENDING_GITIGNORE_NAME = '.gitignore';
/** The folder's .gitignore: the photos never reach git; the descriptions still sync. */
export const PENDING_GITIGNORE = `# Pahlavan: meal photos wait here only until your coach estimates them, so git never keeps them.\n${['jpeg', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif'].map((e) => `*.${e}`).join('\n')}\n`;

export const pendingFile = (id: string): string => `${id}-meal.json`;
export const pendingPhotoFile = (id: string, ext: PendingPhotoExt): string => `${id}-meal.${ext}`;
export const pendingIdOf = (file: string): string | null => PENDING_MEAL_FILE.exec(file)?.[1] ?? null;
const photoIdOf = (file: string): string | null => PENDING_MEAL_PHOTO.exec(file)?.[1] ?? null;

/** What the form holds when Save is pressed. */
export interface MealForm {
  /** What the user ate and anything that helps; may be empty when there is a photo. */
  text: string;
  date: string;
  /** HH:MM, or empty for no time. */
  at: string;
  /** The photo's kind once converted, or null for none. */
  photoExt: PendingPhotoExt | null;
}
export type MealFormField = 'text' | 'date' | 'at' | 'photo';

export interface MealFormPlan {
  /** Each field's problem, in the form's order; nothing is saved while there are any. */
  errors: { field: MealFormField; message: string }[];
  id: string | null;
  entry: PendingMeal | null;
  /** The entry's file name and its text (written last, after the photo). */
  file: string | null;
  text: string | null;
  /** The photo's file name, when there is one (written first). */
  photoFile: string | null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The waiting meal the form makes: checked field by field, its id the moment
 * of the save (`now`, local), with -2, -3 on a clash with a file already in
 * the folder (`taken`, its names).
 */
export function pendingFromForm(input: { form: MealForm; today: IsoDate; now: { date: IsoDate; time: string }; taken: readonly string[] }): MealFormPlan {
  const { form, today, now } = input;
  const errors: MealFormPlan['errors'] = [];
  const words = form.text.trim();
  if (!words && !form.photoExt) errors.push({ field: 'text', message: 'Say what you ate, or add a photo' });
  if (words.length > PENDING_TEXT_MAX) errors.push({ field: 'text', message: `At most ${PENDING_TEXT_MAX.toLocaleString('en-GB')} characters (this has ${words.length.toLocaleString('en-GB')})` });
  if (!isIsoDate(form.date)) errors.push({ field: 'date', message: 'Pick the day you ate it' });
  else if (form.date > today) errors.push({ field: 'date', message: 'That day hasn\'t come yet' });
  const at = form.at.trim();
  if (at && !HHMM.test(at)) errors.push({ field: 'at', message: 'A time like 13:10, or leave it empty' });
  if (errors.length) return { errors, id: null, entry: null, file: null, text: null, photoFile: null };
  const base = `${now.date}T${now.time.replace(/:/g, '-')}`;
  const used = new Set(input.taken.map((n) => pendingIdOf(n) ?? photoIdOf(n)).filter((x): x is string => x !== null));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  const photoFile = form.photoExt ? pendingPhotoFile(id, form.photoExt) : null;
  const entry: PendingMeal = {
    v: PENDING_MEAL_VERSION,
    date: form.date,
    ...(at ? { at } : {}),
    ...(words ? { text: words } : {}),
    ...(photoFile ? { photo: photoFile } : {}),
    made: `${now.date}T${now.time}`,
  };
  const file = pendingFile(id);
  const bad = validatePendingMeal(entry, file);
  if (bad.length) return { errors: bad.map((e) => ({ field: e.path === 'photo' ? 'photo' : e.path === 'date' ? 'date' : e.path === 'at' ? 'at' : 'text', message: `${e.path}: ${e.message}` })), id: null, entry: null, file: null, text: null, photoFile: null };
  return { errors: [], id, entry, file, text: `${JSON.stringify(entry, null, 2)}\n`, photoFile };
}

/** One waiting meal as read from the folder. */
export interface PendingView {
  id: string;
  file: string;
  entry: PendingMeal;
  /** Its photo's file name, or null for none. */
  photo: string | null;
  /** Whether the photo is in the folder (it stays out of git, so another Mac may not have it). */
  photoFound: boolean;
}

export interface PendingRead {
  meals: PendingView[];
  /** Entry files that don't read as a waiting meal, with why. */
  refused: { file: string; reason: string }[];
  /** Photos with no entry beside them (left from a removal that stopped half way). */
  strays: string[];
}

/** The folder's waiting meals (its names, null for no folder), oldest day first. */
export function readPending(names: readonly string[] | null, read: (file: string) => string | null): PendingRead {
  const out: PendingRead = { meals: [], refused: [], strays: [] };
  if (!names) return out;
  const ids = new Set<string>();
  for (const file of names) {
    const id = pendingIdOf(file);
    if (!id) continue;
    ids.add(id);
    const text = read(file);
    if (text === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      out.refused.push({ file, reason: `not valid JSON (${(e as Error).message})` });
      continue;
    }
    const errs = validatePendingMeal(value, file);
    if (errs.length) {
      out.refused.push({ file, reason: errs.map((e) => `${e.path}: ${e.message}`).join('; ') });
      continue;
    }
    const entry = value as PendingMeal;
    out.meals.push({ id, file, entry, photo: entry.photo ?? null, photoFound: entry.photo !== undefined && names.includes(entry.photo) });
  }
  for (const file of names) {
    const id = photoIdOf(file);
    if (id && !ids.has(id)) out.strays.push(file);
  }
  out.meals.sort((a, b) => a.entry.date.localeCompare(b.entry.date) || (a.entry.at ?? '').localeCompare(b.entry.at ?? '') || a.id.localeCompare(b.id));
  return out;
}

/** The files in the folder that belong to one waiting meal: its entry first, then its photos. */
export function pendingFilesOf(names: readonly string[] | null, id: string): string[] {
  if (!names) return [];
  const entry = names.filter((n) => pendingIdOf(n) === id);
  const photos = names.filter((n) => photoIdOf(n) === id);
  return [...entry, ...photos];
}
