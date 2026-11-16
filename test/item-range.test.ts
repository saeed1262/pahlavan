// A session row's target follows that row's own rep range. The plan's lifts
// table can hold a range left from another session (the bench once a main
// press at 8-12, later an accessory at 10-15 elsewhere): the row shows its
// own range, and its target must agree with it.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readVault } from '../src/adapters/vault/read.ts';
import { paths } from '../src/adapters/vault/layout.ts';
import type { PlanData, PlanDataItem } from '../src/core/plan-data.ts';
import { buildReview } from '../src/report/review.ts';
import { buildSession } from '../src/report/session.ts';
import { fixtureFiles, memoryIo } from './helpers.ts';

const PLAN = `v/${paths().plan}`;
const ASOF = '2026-04-12';
const DATE = '2026-04-09';

function vault(edit: (doc: PlanData) => void) {
  const f = fixtureFiles('v');
  const doc = JSON.parse(f[PLAN]!) as PlanData;
  edit(doc);
  f[PLAN] = `${JSON.stringify(doc, null, 2)}\n`;
  return readVault(memoryIo(f, ASOF), 'v', { asOf: ASOF }).data;
}

const benchIn = (doc: PlanData, type: string) => (doc.sessions[type] as PlanDataItem[]).find((i) => i.name === 'Flat DB Bench Press')!;
const benchRow = (data: ReturnType<typeof vault>, type: string) => buildSession(data, DATE, 'full', { type }).items.find((i) => i.name === 'Flat DB Bench Press')!;
const inRange = (reps: number | undefined, [lo, hi]: [number, number]) => reps !== undefined && reps >= lo && reps <= hi;

describe('a session row\'s target and its own rep range', () => {
  it('an item that is not logged targets its own range, not the lifts entry\'s', () => {
    // The lifts entry says 6-8 (the fixture's); the item in A is now an accessory at 10-15.
    const data = vault((doc) => {
      const b = benchIn(doc, 'A');
      b.sr = '2 × 10–15';
      delete b.logged;
    });
    const row = benchRow(data, 'A');
    assert.ok(row.target, 'the bench has history, so a target');
    assert.ok(inRange(row.target!.reps, [10, 15]), `the target's reps (${row.target!.reps}) are in the row's 10-15`);
    const lift = buildReview(data, DATE).lifts.find((l) => l.name === 'Flat DB Bench Press')!;
    assert.deepEqual(lift.repRange, [10, 15], 'the review reads the item\'s range too');
  });

  it('one exercise in two sessions with other ranges: each row gets its own', () => {
    const data = vault((doc) => {
      (doc.sessions['B'] as PlanDataItem[]).splice(2, 0, { name: 'Flat DB Bench Press', sr: '2 × 12–15', rest: '90 s' } as PlanDataItem);
    });
    const a = benchRow(data, 'A');
    const b = benchRow(data, 'B');
    assert.ok(inRange(a.target?.reps, [6, 8]), `A's logged bench keeps the lifts entry's 6-8 (${a.target?.reps})`);
    assert.ok(inRange(b.target?.reps, [12, 15]), `B's bench targets its own 12-15 (${b.target?.reps})`);
  });

  it('a logged main lift is unchanged', () => {
    const data = vault(() => {});
    const row = benchRow(data, 'A');
    assert.ok(inRange(row.target?.reps, [6, 8]));
    const lift = buildReview(data, DATE).lifts.find((l) => l.name === 'Flat DB Bench Press')!;
    assert.deepEqual(lift.repRange, [6, 8]);
  });
});
