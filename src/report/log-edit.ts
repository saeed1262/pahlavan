// `engine log show`, `log edit` and `log delete`: a logged session read,
// changed or taken out from the conversation, as Pahlavan's Log panel does
// it. The session is found by its date, type and label (the log's key). An
// edit is built by the same writer with the session as its original, so the
// fields Pahlavan does not own stay, the logged lifts stay the ones the
// session logged, the frozen exercise list stays while the date does, and
// the checklist stays unless the edit names its skipped lines. Pure: the CLI
// reads, merges, writes and reads back.

import { buildLogEntry, sessionKey, type LogInput } from '../adapters/vault/log-write.ts';
import type { VaultRead } from '../adapters/vault/read.ts';
import { dayText, type IsoDate } from '../core/dates.ts';
import { everySetNames, everySetShape, skipWhyShape } from './log-add.ts';
import { logFormFromEntry } from './log-form.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields an edit may change. The type, the label and Express make the session what it is: to change one, delete it and add it again. */
export const EDIT_KEYS = ['date', 'lift1', 'lift2', 'durationMin', 'cardioMin', 'cardioMode', 'rating', 'postureDrill', 'notes', 'swaps', 'sessionRpe', 'pain', 'hotel', 'trackingLevel', 'exerciseSets', 'skipped', 'skipWhy'] as const;
/** The session's own fields that go into the writer's input as they are (the checklist goes as `skipped` and `skipWhy`). */
const INPUT_KEYS = ['date', 'type', 'label', 'express', ...EDIT_KEYS.filter((k) => k !== 'skipped' && k !== 'skipWhy')] as const;

/** Which session: the log's key, its date, type and label (a custom session's). */
export interface SessionSelector {
  date: IsoDate;
  type: string;
  label: string | null;
}

export const selectorKey = (s: SessionSelector) => sessionKey({ date: s.date, type: s.type, label: s.label });

/** The session the selector names in the log as parsed, or null, with the day's sessions for the message when it isn't there. */
export function findSession(log: unknown, sel: SessionSelector): { session: Obj | null; sameDay: Obj[] } {
  const sessions = isObj(log) && Array.isArray(log['sessions']) ? (log['sessions'] as unknown[]).filter(isObj) : [];
  const key = selectorKey(sel);
  return { session: sessions.find((s) => sessionKey(s) === key) ?? null, sameDay: sessions.filter((s) => s['date'] === sel.date) };
}

/** Why the selector finds nothing: the session it names, and what that day holds instead. */
export function missingText(sel: SessionSelector, sameDay: readonly Obj[]): string {
  const named = (s: { type?: unknown; label?: unknown }) => `${String(s.type)}${s.label ? ` "${String(s.label)}"` : ''}`;
  const day = dayText(sel.date);
  return `no ${named(sel)} session is logged on ${day}${sameDay.length ? `; that day holds ${sameDay.map(named).join(', ')} (a custom session is named with --label)` : '; nothing is logged that day'}`;
}

/** The checklist's line names, in its order, as the Log panel's edit form lists them (none for a custom session). */
export function checklistNames(read: VaultRead, session: Obj): string[] {
  if (session['type'] === 'custom') return [];
  return logFormFromEntry(read, session).rows.filter((r) => r.line !== null).map((r) => r.line!);
}

/**
 * `log show`: the session as `log edit` takes it (its fields as the writer
 * reads them, the checklist as `skipped` and `skipWhy`), and the checklist's
 * line names, the only names `skipped` takes.
 */
export function editableSession(read: VaultRead, session: Obj): { input: Obj; lines: string[] } {
  // The type, the label and Express are named by the flags, not edited: they stay out, so show's input goes back to edit as it is.
  const input: Obj = {};
  for (const k of EDIT_KEYS) if (k !== 'skipped' && k !== 'skipWhy' && session[k] !== undefined) input[k] = session[k];
  const ck = isObj(session['checklist']) ? session['checklist'] : null;
  if (ck) {
    input['skipped'] = Array.isArray(ck['skipped']) ? ck['skipped'] : [];
    if (isObj(ck['why']) && Object.keys(ck['why']).length) input['skipWhy'] = ck['why'];
  }
  return { input, lines: checklistNames(read, session) };
}

/**
 * The session after an edit: the changed fields over the session's own,
 * through the log writer with the session as the original (its checks and
 * its messages). The checklist is rebuilt only when the edit gives
 * `skipped` or `skipWhy` (then from the session's own lines), and every
 * set's exercise is checked against the session's list. Nothing is merged
 * here; an entry equal to the session is no change.
 */
export function logEditEntry(read: VaultRead, session: Obj, patch: unknown, today: IsoDate): { ok: true; entry: Obj; changed: string[] } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!isObj(patch)) return fail('the edit file holds one object: the fields to change, as `log show` gives them');
  const bad = Object.keys(patch).filter((k) => !(EDIT_KEYS as readonly string[]).includes(k) && !k.startsWith('_'));
  if (bad.length) {
    const identity = bad.filter((k) => k === 'type' || k === 'label' || k === 'express');
    return fail(`an edit changes any of ${EDIT_KEYS.join(', ')}; not ${bad.join(', ')}${identity.length ? ' (the type, the label and Express make the session what it is: log delete it, then log add it as it was)' : ''}`);
  }
  const fields = Object.keys(patch).filter((k) => !k.startsWith('_'));
  if (!fields.length) return fail('the edit changes nothing: give the fields to change');
  const input: Obj = {};
  for (const k of INPUT_KEYS) if (session[k] !== undefined) input[k] = session[k];
  for (const k of fields) if (k !== 'skipped' && k !== 'skipWhy') input[k] = patch[k];
  const shape = everySetShape(input);
  if (shape) return fail(shape);

  // The checklist: as it is, unless the edit names the skipped lines or their reasons.
  let lines: LogInput['lines'];
  if ('skipped' in patch || 'skipWhy' in patch) {
    const names = checklistNames(read, session);
    if (!names.length) return fail('a custom session has no checklist: it skips nothing');
    const ck = isObj(session['checklist']) ? session['checklist'] : {};
    const skipped = 'skipped' in patch ? patch['skipped'] : (ck['skipped'] ?? []);
    if (!Array.isArray(skipped) || !skipped.every((x) => typeof x === 'string')) return fail('"skipped" lists the checklist lines skipped, by name');
    // An older checklist names a paired line whole ("Face Pull + Band External Rotation") where the frozen list has its
    // parts: the pair stands for its parts, as the Log panel's edit form reads it.
    const partsOf = (n: string): string[] | null => (names.includes(n) ? [n] : n.includes(' + ') && n.split(' + ').every((p) => names.includes(p)) ? n.split(' + ') : null);
    const unknown = skipped.filter((x) => !partsOf(x));
    if (unknown.length) return fail(`"skipped" names ${unknown.join('; ')}, not a line of this session; its lines: ${names.join('; ')}`);
    const why = 'skipWhy' in patch ? patch['skipWhy'] : (ck['why'] ?? {});
    const whyErr = skipWhyShape(why);
    if (whyErr) return fail(whyErr);
    const reasons = (why ?? {}) as Record<string, string>;
    const stray = Object.keys(reasons).filter((k) => !skipped.includes(k));
    if (stray.length) return fail(`"skipWhy" gives a reason for ${stray.join('; ')}, a line not skipped`);
    const kept = same(skipped, ck['skipped'] ?? []) && same(reasons, isObj(ck['why']) ? ck['why'] : {});
    if (!kept) {
      const off = new Map<string, string | null>();
      for (const n of skipped) for (const p of partsOf(n)!) off.set(p, reasons[n] ?? null);
      lines = names.map((name) => ({ name, done: !off.has(name), why: off.get(name) ?? null }));
    }
  }
  const built = buildLogEntry({ ...input, ...(lines ? { lines } : {}) } as LogInput, { plan: read.raw?.plan, log: read.raw?.log, today, original: session });
  if (!built.ok) return built;
  const entry = built.entry;
  const frozen = Array.isArray(entry['exercises']) ? (entry['exercises'] as unknown[]).filter(isObj).map((x) => ({ name: String(x['name']) })) : [];
  const names = everySetNames(read, entry, frozen);
  if (names) return fail(names);
  const changed = [...new Set([...Object.keys(entry), ...Object.keys(session)])].filter((k) => !same(entry[k], session[k]));
  return { ok: true, entry, changed };
}
