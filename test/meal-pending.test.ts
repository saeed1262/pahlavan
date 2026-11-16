// Meals waiting for the coach (Coach/Inbox/meals/): what Pahlavan's meal
// form saves (`pendingFromForm`), how the folder reads (`readPending`), and
// the engine's `meal pending`, `meal add --pending` and `meal discard`. A
// waiting meal's files go only once its meal is saved. In-memory copies of
// the synthetic vault, and one run of the built engine on a temp copy.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { run } from '../src/cli/cli.ts';
import { validatePendingMeal } from '../src/core/validate.ts';
import { PENDING_GITIGNORE, pendingFromForm, pendingFilesOf, readPending } from '../src/report/meal-pending.ts';
import { builtEngine, fixtureFiles, memoryIo, VAULT } from './helpers.ts';

type Json = Record<string, any>;
const TODAY = '2026-04-12';
const DIR = 'v/3-Personal/Fitness/Coach/Inbox/meals';
const MEALS = 'v/3-Personal/Fitness/Coach/meals.json';
const TRACKING = 'v/3-Personal/Fitness/Coach/tracking.json';
const HABITS = 'v/5-System/Data/habits-data.json';
const FILE = 'v/meal.json';
const ID = '2026-04-12T13-12-40';
const NOW = { date: TODAY, time: '13:12:40' };

const form = (over: Json = {}) => ({ text: 'Chicken, rice and salad; a palm of chicken', date: TODAY, at: '13:10', photoExt: 'jpeg' as const, ...over });
const waiting = (over: Json = {}): Json => ({ v: 1, date: TODAY, at: '13:10', text: 'Chicken, rice and salad; a palm of chicken', photo: `${ID}-meal.jpeg`, made: `${TODAY}T13:12:40`, ...over });
const lunch = (over: Json = {}): Json => ({
  date: TODAY,
  at: '13:10',
  name: 'Lunch: chicken, rice and salad',
  items: [{ food: 'grilled chicken breast', portion: 'about 150 g (a palm and a half)' }],
  estimate: { proteinG: 48, kcal: 620 },
  confidence: 'medium',
  from: 'photo',
  ...over,
});

/** The fixture with one waiting meal (and its photo, unless `photo` is false). */
function withWaiting(f: Record<string, string>, entry: Json = waiting(), photo = true): void {
  f[`${DIR}/${ID}-meal.json`] = `${JSON.stringify(entry, null, 2)}\n`;
  if (photo) f[`${DIR}/${ID}-meal.jpeg`] = 'JPEG BYTES';
  f[`${DIR}/.gitignore`] = PENDING_GITIGNORE;
}

function cli(argv: string[], edit: (f: Record<string, string>) => void = () => {}, opts: { files?: Record<string, string>; onRead?: (p: string, f: Record<string, string>) => void } = {}) {
  const f = opts.files ?? fixtureFiles('v');
  edit(f);
  const writes: string[] = [];
  const mem = memoryIo(f, TODAY);
  const io = {
    ...mem,
    readText: (p: string) => {
      opts.onRead?.(p, f);
      return mem.readText(p);
    },
    writeMeals: (_root: string, text: string) => { writes.push('meals'); f[MEALS] = text; },
    writeTracking: (_root: string, text: string) => { writes.push('tracking'); f[TRACKING] = text; },
    writeHabits: (_root: string, text: string) => { writes.push('habits'); f[HABITS] = text; },
    removePending: (_root: string, file: string) => { writes.push(`remove ${file}`); delete f[`${DIR}/${file}`]; },
  };
  const r = run([...argv, '--vault', 'v'], io as never);
  return { code: r.code, out: JSON.parse(r.stdout) as Json, writes, files: f };
}
const addPending = (meal: Json, write: boolean, edit: (f: Record<string, string>) => void = withWaiting, opts = {}) =>
  cli(['meal', 'add', '--file', FILE, '--pending', ID, ...(write ? ['--write'] : [])], (f) => { edit(f); f[FILE] = JSON.stringify(meal); }, opts);

describe('the meal form: pendingFromForm', () => {
  it('a meal with words and a photo: its id the moment of the save, the photo named after it, valid', () => {
    const p = pendingFromForm({ form: form(), today: TODAY, now: NOW, taken: [] });
    assert.deepEqual(p.errors, []);
    assert.equal(p.id, ID);
    assert.equal(p.file, `${ID}-meal.json`);
    assert.equal(p.photoFile, `${ID}-meal.jpeg`);
    assert.deepEqual(p.entry, waiting());
    assert.deepEqual(Object.keys(p.entry!), ['v', 'date', 'at', 'text', 'photo', 'made'], 'the keys in the file\'s order');
    assert.deepEqual(validatePendingMeal(JSON.parse(p.text!), p.file!), []);
  });

  it('words alone, or a photo alone, are each enough; an empty time is left out', () => {
    const words = pendingFromForm({ form: form({ photoExt: null, at: '' }), today: TODAY, now: NOW, taken: [] });
    assert.deepEqual(words.errors, []);
    assert.equal(words.entry!.photo, undefined);
    assert.equal(words.entry!.at, undefined);
    const photo = pendingFromForm({ form: form({ text: '   ' }), today: TODAY, now: NOW, taken: [] });
    assert.deepEqual(photo.errors, []);
    assert.equal(photo.entry!.text, undefined, 'blank words are left out');
  });

  it('each field\'s problem, and nothing saved while there are any', () => {
    const p = pendingFromForm({ form: form({ text: '', photoExt: null, date: '2026-04-13', at: '25:00' }), today: TODAY, now: NOW, taken: [] });
    assert.deepEqual(p.errors.map((e) => e.field), ['text', 'date', 'at']);
    assert.equal(p.text, null);
    assert.deepEqual(pendingFromForm({ form: form({ text: 'x'.repeat(2001) }), today: TODAY, now: NOW, taken: [] }).errors.map((e) => e.field), ['text']);
    assert.deepEqual(pendingFromForm({ form: form({ date: 'yesterday' }), today: TODAY, now: NOW, taken: [] }).errors.map((e) => e.field), ['date']);
  });

  it('a save in the same second as one already there gets a counter', () => {
    const p = pendingFromForm({ form: form(), today: TODAY, now: NOW, taken: [`${ID}-meal.json`, `${ID}-meal.jpeg`, `${ID}-2-meal.jpeg`, '.gitignore'] });
    assert.equal(p.id, `${ID}-3`, 'a photo left alone counts as taken too');
    assert.equal(p.entry!.photo, `${ID}-3-meal.jpeg`);
  });
});

describe('the folder: readPending', () => {
  it('a valid meal, one that doesn\'t read, a missing photo and a photo left alone', () => {
    const files: Record<string, string> = {
      [`${ID}-meal.json`]: JSON.stringify(waiting()),
      [`${ID}-meal.jpeg`]: 'x',
      '2026-04-11T08-00-00-meal.json': JSON.stringify(waiting({ date: '2026-04-11', at: '08:00', photo: '2026-04-11T08-00-00-meal.jpeg' })),
      '2026-04-10T09-00-00-meal.json': '{ not json',
      '2026-04-09T09-00-00-meal.json': JSON.stringify({ v: 1, date: '2026-04-09', made: '2026-04-09T09:00:00' }),
      '2026-04-08T09-00-00-meal.png': 'x',
      '.gitignore': PENDING_GITIGNORE,
      'notes.txt': 'x',
    };
    const r = readPending(Object.keys(files), (f) => files[f] ?? null);
    assert.deepEqual(r.meals.map((m) => [m.id, m.photoFound]), [['2026-04-11T08-00-00', false], [ID, true]], 'oldest day first; the photo checked');
    assert.deepEqual(r.refused.map((x) => x.file).sort(), ['2026-04-09T09-00-00-meal.json', '2026-04-10T09-00-00-meal.json']);
    assert.match(r.refused.find((x) => x.file.startsWith('2026-04-09'))!.reason, /neither text nor a photo/);
    assert.deepEqual(r.strays, ['2026-04-08T09-00-00-meal.png']);
    assert.deepEqual(readPending(null, () => null), { meals: [], refused: [], strays: [] }, 'no folder: nothing waiting');
  });

  it('a meal\'s files: its entry first, then its photo', () => {
    assert.deepEqual(pendingFilesOf([`${ID}-meal.jpeg`, '.gitignore', `${ID}-meal.json`, `${ID}-2-meal.json`], ID), [`${ID}-meal.json`, `${ID}-meal.jpeg`]);
  });

  it('a photo named after another file is refused', () => {
    assert.match(validatePendingMeal(waiting({ photo: '2026-04-12T10-00-00-meal.jpeg' }), `${ID}-meal.json`).map((e) => e.message).join(), /not named after its file/);
  });
});

describe('meal pending', () => {
  it('lists each waiting meal with its words and the photo\'s path; reads only', () => {
    const r = cli(['meal', 'pending'], withWaiting);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(r.out.state, 'found');
    assert.deepEqual(r.out.meals, [{ id: ID, file: `3-Personal/Fitness/Coach/Inbox/meals/${ID}-meal.json`, date: TODAY, at: '13:10', text: 'Chicken, rice and salad; a palm of chicken', photo: `3-Personal/Fitness/Coach/Inbox/meals/${ID}-meal.jpeg`, photoFound: true, made: `${TODAY}T13:12:40` }]);
    assert.deepEqual(r.writes, []);
  });

  it('a photo not on this Mac is a warning: estimate from the words', () => {
    const r = cli(['meal', 'pending'], (f) => withWaiting(f, waiting(), false));
    assert.equal(r.out.meals[0].photoFound, false);
    assert.ok(r.out.warnings.some((w: Json) => w.code === 'photo-missing'));
  });

  it('no folder yet: nothing waiting', () => {
    const r = cli(['meal', 'pending']);
    assert.equal(r.code, 0);
    assert.equal(r.out.state, 'missing');
    assert.deepEqual(r.out.meals, []);
  });
});

describe('meal add --pending', () => {
  it('a dry run names the files it would remove and removes nothing', () => {
    const r = addPending(lunch(), false);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.deepEqual(r.out.pending, { id: ID, files: [`3-Personal/Fitness/Coach/Inbox/meals/${ID}-meal.json`, `3-Personal/Fitness/Coach/Inbox/meals/${ID}-meal.jpeg`], removed: false });
    assert.deepEqual(r.writes, []);
  });

  it('--write saves the meal first, then removes the entry and its photo; the .gitignore stays', () => {
    const r = addPending(lunch(), true);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.deepEqual(r.writes, ['meals', `remove ${ID}-meal.json`, `remove ${ID}-meal.jpeg`]);
    assert.equal(r.out.pending.removed, true);
    assert.equal(r.files[`${DIR}/${ID}-meal.json`], undefined);
    assert.equal(r.files[`${DIR}/.gitignore`], PENDING_GITIGNORE);
    assert.equal(JSON.parse(r.files[MEALS]!).meals.length, 1);
  });

  it('at the day\'s protein goal: the meal, the removal, then the tick', () => {
    const r = addPending(lunch({ estimate: { proteinG: 140, kcal: 900 } }), true);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(r.out.protein.tick, 'added');
    assert.deepEqual(r.writes, ['meals', `remove ${ID}-meal.json`, `remove ${ID}-meal.jpeg`, 'tracking', 'habits']);
  });

  it('a meal recorded before (a run that stopped half way): its waiting files go now', () => {
    const first = addPending(lunch(), true);
    const again = addPending(lunch(), true, withWaiting, { files: first.files });
    assert.equal(again.out.result, 'already');
    assert.deepEqual(again.writes, [`remove ${ID}-meal.json`, `remove ${ID}-meal.jpeg`]);
    assert.equal(again.out.pending.removed, true);
  });

  it('a waiting meal that isn\'t there: refused, nothing written', () => {
    const r = addPending(lunch(), true, () => {});
    assert.equal(r.code, 1);
    assert.equal(r.out.errors[0].code, 'not-found');
    assert.deepEqual(r.writes, []);
  });

  it('the waiting file changed during the merge: read again, then written', () => {
    let reads = 0;
    const r = addPending(lunch(), true, withWaiting, {
      onRead: (p: string, f: Record<string, string>) => {
        if (p.endsWith(`${ID}-meal.json`) && ++reads === 2) f[`${DIR}/${ID}-meal.json`] = `${JSON.stringify(waiting({ text: 'Chicken and rice' }), null, 2)}\n`;
      },
    });
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.ok(reads >= 3, 'the entry read again on the second attempt');
    assert.equal(r.out.pending.removed, true);
  });

  it('a meal dated another day than the form\'s: a warning, still written', () => {
    const r = addPending(lunch({ date: '2026-04-11' }), true);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.ok(r.out.warnings.some((w: Json) => w.code === 'pending-date'));
  });

  it('a malformed id is a usage error', () => {
    const r = cli(['meal', 'add', '--file', FILE, '--pending', '../../plan-data'], (f) => void (f[FILE] = JSON.stringify(lunch())));
    assert.equal(r.code, 2);
  });
});

describe('meal discard', () => {
  it('a dry run lists the files; --write removes them', () => {
    const dry = cli(['meal', 'discard', '--pending', ID], withWaiting);
    assert.equal(dry.code, 0, JSON.stringify(dry.out.errors));
    assert.equal(dry.out.files.length, 2);
    assert.deepEqual(dry.writes, []);
    const r = cli(['meal', 'discard', '--pending', ID, '--write'], withWaiting);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.deepEqual(r.writes, [`remove ${ID}-meal.json`, `remove ${ID}-meal.jpeg`]);
    assert.equal(r.out.written, true);
  });

  it('a photo left alone is discarded by its id too; an id with no files is not found', () => {
    const stray = cli(['meal', 'discard', '--pending', ID, '--write'], (f) => void (f[`${DIR}/${ID}-meal.jpeg`] = 'x'));
    assert.deepEqual(stray.writes, [`remove ${ID}-meal.jpeg`]);
    const none = cli(['meal', 'discard', '--pending', ID]);
    assert.equal(none.code, 1);
    assert.equal(none.out.errors[0].code, 'not-found');
  });
});

describe('validate a waiting meal', () => {
  it('takes it by its shape, or with --kind pending-meal', () => {
    const f = fixtureFiles('v');
    withWaiting(f);
    for (const extra of [[], ['--kind', 'pending-meal']]) {
      const r = run(['validate', `${DIR}/${ID}-meal.json`, ...extra], memoryIo(f, TODAY) as never);
      assert.equal(r.code, 0, r.stdout);
      assert.equal(JSON.parse(r.stdout).shape ?? JSON.parse(r.stdout).results?.[0]?.shape ?? 'pendingMeal', 'pendingMeal');
    }
    f[`${DIR}/${ID}-meal.json`] = JSON.stringify({ v: 1, date: TODAY, made: `${TODAY}T13:12:40` });
    assert.equal(run(['validate', `${DIR}/${ID}-meal.json`, '--kind', 'pending-meal'], memoryIo(f, TODAY) as never).code, 1, 'neither words nor a photo');
  });
});

describe('the built engine', () => {
  it('records a waiting meal on disk: meals.json written, the entry and its photo gone, nothing else changed', () => {
    const engine = builtEngine();
    const tmp = mkdtempSync(join(tmpdir(), 'pahlavan-pending-'));
    try {
      const vault = join(tmp, 'v');
      cpSync(VAULT, vault, { recursive: true });
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const id = `${today}T13-12-40`;
      const dir = join(vault, '3-Personal/Fitness/Coach/Inbox/meals');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}-meal.json`), JSON.stringify(waiting({ date: today, photo: `${id}-meal.jpeg`, made: `${today}T13:12:40` })));
      writeFileSync(join(dir, `${id}-meal.jpeg`), 'JPEG BYTES');
      writeFileSync(join(dir, '.gitignore'), PENDING_GITIGNORE);
      const list = (d: string, base = d): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? list(join(d, n), base) : [join(d, n).slice(base.length + 1)]));
      const before = Object.fromEntries(list(vault).map((p) => [p, readFileSync(join(vault, p), 'utf8')]));
      writeFileSync(join(tmp, 'meal.json'), JSON.stringify(lunch({ date: today })));
      const pending = spawnSync(process.execPath, [engine, 'meal', 'pending', '--vault', vault, '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(pending.stdout).meals[0].id, id);
      const r = spawnSync(process.execPath, [engine, 'meal', 'add', '--vault', vault, '--file', join(tmp, 'meal.json'), '--pending', id, '--write', '--json'], { encoding: 'utf8' });
      const out = JSON.parse(r.stdout) as Json;
      assert.equal(r.status, 0, JSON.stringify(out.errors));
      assert.equal(existsSync(join(dir, `${id}-meal.json`)), false);
      assert.equal(existsSync(join(dir, `${id}-meal.jpeg`)), false);
      assert.equal(existsSync(join(dir, '.gitignore')), true);
      const after = Object.fromEntries(list(vault).map((p) => [p, readFileSync(join(vault, p), 'utf8')]));
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => before[p] !== after[p]).sort();
      assert.deepEqual(changed, ['3-Personal/Fitness/Coach/Inbox/meals/' + `${id}-meal.jpeg`, '3-Personal/Fitness/Coach/Inbox/meals/' + `${id}-meal.json`, '3-Personal/Fitness/Coach/meals.json']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
