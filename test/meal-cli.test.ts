// `engine meal`: the coach's meal estimates in Coach/meals.json. `meal add`
// checks one meal, adds up its day and ticks the Protein item once the day's
// estimated protein reaches its goal; `meal show` reads a day or a span;
// `meal delete` takes one out. In-memory copies of the synthetic vault, and
// one run of the built engine on a temp copy.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { run } from '../src/cli/cli.ts';
import { validateMeals } from '../src/core/validate.ts';
import { dayTotals } from '../src/report/meal-write.ts';
import { builtEngine, fixtureFiles, memoryIo, VAULT } from './helpers.ts';

type Json = Record<string, any>;
const TODAY = '2026-04-12';
const MEALS = 'v/3-Personal/Fitness/Coach/meals.json';
const TRACKING = 'v/3-Personal/Fitness/Coach/tracking.json';
const HABITS = 'v/5-System/Data/habits-data.json';
const EATING = 'v/3-Personal/Fitness/Coach/eating-plan.json';
const FILE = 'v/meal.json';

const lunch = (over: Json = {}): Json => ({
  date: TODAY,
  at: '13:10',
  name: 'Lunch: chicken, rice and salad',
  items: [{ food: 'grilled chicken breast', portion: 'about 150 g (a palm and a half)' }, { food: 'white rice', portion: '1 cupped hand' }],
  estimate: { proteinG: 48, kcal: 620, fiberG: 4, fatG: 18, carbsG: 60 },
  confidence: 'medium',
  from: 'photo',
  note: 'oil not visible: 1 tsp assumed',
  ...over,
});

function cli(argv: string[], edit: (f: Record<string, string>) => void = () => {}, files?: Record<string, string>) {
  const f = files ?? fixtureFiles('v');
  edit(f);
  const writes: string[] = [];
  const io = {
    ...memoryIo(f, TODAY),
    writeMeals: (_root: string, text: string) => { writes.push('meals'); f[MEALS] = text; },
    writeTracking: (_root: string, text: string) => { writes.push('tracking'); f[TRACKING] = text; },
    writeHabits: (_root: string, text: string) => { writes.push('habits'); f[HABITS] = text; },
  };
  const r = run([...argv, '--vault', 'v'], io as never);
  return { code: r.code, out: JSON.parse(r.stdout) as Json, writes, files: f };
}
const add = (meal: Json, write = true, files?: Record<string, string>) => cli(['meal', 'add', '--file', FILE, ...(write ? ['--write'] : [])], (f) => void (f[FILE] = JSON.stringify(meal)), files);
const meals = (f: Record<string, string>) => (JSON.parse(f[MEALS]!) as Json).meals as Json[];
const proteinDay = (f: Record<string, string>, date: string) => {
  const t = JSON.parse(f[TRACKING]!) as Json;
  return t.days?.[date]?.protein;
};

describe('meal add', () => {
  it('a dry run shows the meal with its id, the day added up and the Protein tick it would leave; nothing is written', () => {
    const r = add(lunch(), false);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(r.out.result, 'added');
    assert.equal(r.out.meal.id, `${TODAY}-1310`);
    assert.equal(r.out.meal.by, 'coach');
    assert.deepEqual(r.out.day, { date: TODAY, meals: 1, proteinG: 48, kcal: 620, fiberG: 4, fatG: 18, carbsG: 60, partial: [] });
    assert.deepEqual(r.out.protein, { item: 'protein', goalG: 134, totalG: 48, tick: 'short' });
    assert.deepEqual(r.writes, []);
  });

  it('--write saves it, valid, and the same meal again is "already"', () => {
    const first = add(lunch());
    assert.equal(first.code, 0, JSON.stringify(first.out.errors));
    assert.equal(first.out.written, true);
    assert.deepEqual(first.writes, ['meals'], 'below the goal: no tick');
    assert.deepEqual(validateMeals(JSON.parse(first.files[MEALS]!)), []);
    const again = add(lunch(), true, first.files);
    assert.equal(again.out.result, 'already');
    assert.equal(again.out.written, false);
    assert.equal(meals(again.files).length, 1);
  });

  it('a second meal at the same time gets its own id; a meal with no time a counter', () => {
    const a = add(lunch());
    const b = add(lunch({ name: 'Second lunch', estimate: { proteinG: 20 } }), true, a.files);
    assert.equal(b.out.meal.id, `${TODAY}-1310-2`);
    const c = add(lunch({ at: undefined, name: 'A snack', estimate: { proteinG: 10 } }), true, b.files);
    assert.equal(c.out.meal.id, `${TODAY}-meal`);
    assert.deepEqual(meals(c.files).map((m) => m.id), [`${TODAY}-meal`, `${TODAY}-1310`, `${TODAY}-1310-2`], 'by time, a meal with no time first');
  });

  it('the meal that brings the day to the goal ticks Protein and its habit, in the same write', () => {
    const a = add(lunch({ at: '08:00', name: 'Breakfast', estimate: { proteinG: 40, kcal: 450 } }));
    const b = add(lunch({ at: '13:10', estimate: { proteinG: 50 } }), true, a.files);
    assert.equal(b.out.protein.tick, 'short');
    const c = add(lunch({ at: '19:30', name: 'Dinner', estimate: { proteinG: 50, kcal: 700 } }), true, b.files);
    assert.equal(c.code, 0, JSON.stringify(c.out.errors));
    assert.deepEqual(c.out.protein, { item: 'protein', goalG: 134, totalG: 140, tick: 'added' });
    assert.deepEqual(c.writes, ['meals', 'tracking', 'habits']);
    assert.equal(c.out.day.kcal, 1150, 'the meals that give calories');
    assert.deepEqual(c.out.day.partial, ['kcal'], 'one meal gave protein only, so its calories are the other two\'s');
    assert.equal(c.out.day.fiberG, null, 'no meal gave fiber');
    const d = add(lunch({ at: '21:00', name: 'A late snack', estimate: { proteinG: 10 } }), true, c.files);
    assert.equal(d.out.protein.tick, 'already');
    assert.deepEqual(d.writes, ['meals']);
  });

  it('refused: a date after today, a number out of bounds, a meal with no foods', () => {
    const late = add(lunch({ date: '2026-04-13' }));
    assert.equal(late.code, 1);
    assert.match(late.out.errors[0].message, /after today/);
    const big = add(lunch({ estimate: { proteinG: 900 } }));
    assert.equal(big.code, 1);
    assert.match(big.out.errors[0].message, /estimate\.proteinG: must be at most 300/);
    assert.equal(add(lunch({ items: [] })).code, 1);
    assert.deepEqual(add(lunch({ date: '2026-04-13' })).writes, []);
  });

  it('where the eating plan\'s screen ruled counting out: protein only', () => {
    const files = fixtureFiles('v');
    const plan = JSON.parse(readFileSync(join(VAULT, '..', 'food', 'eating-plan.json'), 'utf8')) as Json;
    files[EATING] = JSON.stringify({ ...plan, counting: 'none' });
    const r = add(lunch(), true, { ...files });
    assert.equal(r.code, 1);
    assert.equal(r.out.errors[0].code, 'counting-none');
    assert.deepEqual(r.writes, []);
    const ok = add(lunch({ estimate: { proteinG: 48 } }), true, { ...files });
    assert.equal(ok.code, 0, JSON.stringify(ok.out.errors));
  });

  it('--file is needed; meal add takes no --id', () => {
    assert.equal(cli(['meal', 'add']).code, 2);
    assert.equal(cli(['meal', 'add', '--file', FILE, '--id', 'x']).code, 2);
    assert.equal(cli(['meal', 'eat']).code, 2);
  });
});

describe('meal show and meal delete', () => {
  it('show: a day with its meals and totals, or a span; no file is calm', () => {
    const none = cli(['meal', 'show']);
    assert.equal(none.code, 0);
    assert.equal(none.out.state, 'missing');
    assert.equal(none.out.days[0].meals, 0);
    const a = add(lunch());
    const day = cli(['meal', 'show', '--date', TODAY], () => {}, a.files);
    assert.equal(day.out.days[0].proteinG, 48);
    assert.equal(day.out.days[0].list[0].id, `${TODAY}-1310`);
    const span = cli(['meal', 'show', '--from', '2026-04-06', '--to', TODAY], () => {}, a.files);
    assert.equal(span.out.days.length, 7);
    assert.equal(cli(['meal', 'show', '--from', TODAY]).code, 2, 'both ends');
    assert.equal(cli(['meal', 'show', '--from', '2026-01-01', '--to', TODAY]).code, 2, '62 days at most');
  });

  it('delete: by id, a dry run first; the day\'s Protein tick stays', () => {
    const a = add(lunch({ estimate: { proteinG: 140 } }));
    assert.equal(a.out.protein.tick, 'added');
    const dry = cli(['meal', 'delete', '--id', `${TODAY}-1310`], () => {}, a.files);
    assert.equal(dry.out.result, 'deleted');
    assert.deepEqual(dry.writes, []);
    const del = cli(['meal', 'delete', '--id', `${TODAY}-1310`, '--write'], () => {}, a.files);
    assert.equal(del.out.written, true);
    assert.deepEqual(meals(del.files), []);
    assert.ok(proteinDay(del.files, TODAY) ?? true, 'the tick is left as it was');
    const missing = cli(['meal', 'delete', '--id', 'nope'], () => {}, del.files);
    assert.equal(missing.code, 1);
    assert.equal(missing.out.errors[0].code, 'not-found');
  });

  it('validate --kind meals, and inferred from the file', () => {
    const a = add(lunch());
    for (const argv of [['validate', MEALS], ['validate', MEALS, '--kind', 'meals']]) {
      const r = run(argv, memoryIo(a.files, TODAY) as never);
      const v = JSON.parse(r.stdout) as Json;
      assert.equal(r.code, 0, r.stdout);
      assert.equal(v.kind, 'meals');
      assert.equal(v.valid, true);
    }
  });
});

describe('dayTotals', () => {
  it('adds each number over the meals that give it, rounded to a tenth', () => {
    const m = [lunch({ id: 'x-1', estimate: { proteinG: 10.25, kcal: 100 } }), lunch({ id: 'x-2', estimate: { proteinG: 20.1 } })] as never;
    assert.deepEqual(dayTotals(m, TODAY), { date: TODAY, meals: 2, proteinG: 30.4, kcal: 100, fiberG: null, fatG: null, carbsG: null, partial: ['kcal'] });
  });
});

describe('meal with the built engine', () => {
  it('a meal that reaches the goal changes only meals.json, tracking.json and habits-data.json', () => {
    const engine = builtEngine();
    const tmp = mkdtempSync(join(tmpdir(), 'pahlavan-meal-'));
    try {
      const vault = join(tmp, 'v');
      cpSync(VAULT, vault, { recursive: true });
      const list = (d: string, base = d): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? list(join(d, n), base) : [join(d, n).slice(base.length + 1)]));
      const before = Object.fromEntries(list(vault).map((p) => [p, readFileSync(join(vault, p), 'utf8')]));
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      writeFileSync(join(tmp, 'meal.json'), JSON.stringify(lunch({ date: today, estimate: { proteinG: 140, kcal: 900 } })));
      const r = spawnSync(process.execPath, [engine, 'meal', 'add', '--vault', vault, '--file', join(tmp, 'meal.json'), '--write', '--json'], { encoding: 'utf8' });
      const out = JSON.parse(r.stdout) as Json;
      assert.equal(r.status, 0, JSON.stringify(out.errors));
      const after = list(vault);
      const changed = after.filter((p) => before[p] !== readFileSync(join(vault, p), 'utf8')).sort();
      const expected = ['3-Personal/Fitness/Coach/meals.json', ...(out.protein.tick === 'added' ? ['3-Personal/Fitness/Coach/tracking.json', '5-System/Data/habits-data.json'] : [])].sort();
      assert.deepEqual(changed, expected);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
