// The Food tab's Meals card model: today's meals from Coach/meals.json with
// the day added up, the waiting ones from the folder, and what couldn't be
// read. Made-up meals.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readPending } from '../src/report/meal-pending.ts';
import { buildMealsCard } from '../src/report/meals-card.ts';

const D = '2026-04-12';
const meal = (id: string, date: string, at: string, proteinG: number, kcal?: number) => ({ id, date, at, name: `Meal ${id}`, items: [{ food: 'food', portion: 'a palm' }], estimate: { proteinG, ...(kcal !== undefined ? { kcal } : {}) }, confidence: 'medium', from: 'text', by: 'coach' });
const file = (meals: object[]) => JSON.stringify({ schemaVersion: 1, meals });
const none = readPending(null, () => null);

describe('buildMealsCard', () => {
  it('today\'s meals in order with the day\'s totals; other days left out', () => {
    const c = buildMealsCard({ mealsText: file([meal(`${D}-0740`, D, '07:40', 34, 520), meal(`${D}-1310`, D, '13:10', 48), meal('2026-04-11-1900', '2026-04-11', '19:00', 60, 800)]), pending: none, date: D, counting: 'allowed', goalG: 134 });
    assert.deepEqual(c.meals.map((m) => [m.id, m.proteinG, m.kcal]), [[`${D}-0740`, 34, 520], [`${D}-1310`, 48, null]]);
    assert.equal(c.totals?.proteinG, 82);
    assert.equal(c.totals?.kcal, 520);
    assert.deepEqual(c.totals?.partial, ['kcal']);
    assert.equal(c.goalG, 134);
    assert.deepEqual(c.problems, []);
  });

  it('no meals today: no totals; the waiting meals listed; a refused file named', () => {
    const names = ['2026-04-12T10-21-05-meal.json', '2026-04-12T10-21-05-meal.jpeg', '2026-04-11T09-00-00-meal.json'];
    const texts: Record<string, string> = {
      '2026-04-12T10-21-05-meal.json': JSON.stringify({ v: 1, date: D, at: '10:20', text: 'A shake', photo: '2026-04-12T10-21-05-meal.jpeg', made: `${D}T10:21:05` }),
      '2026-04-11T09-00-00-meal.json': '{',
    };
    const c = buildMealsCard({ mealsText: null, pending: readPending(names, (f) => texts[f] ?? null), date: D, counting: null, goalG: null });
    assert.equal(c.totals, null);
    assert.deepEqual(c.waiting, [{ id: '2026-04-12T10-21-05', date: D, at: '10:20', text: 'A shake', photo: true, photoFound: true }]);
    assert.equal(c.problems.length, 1);
    assert.match(c.problems[0]!, /2026-04-11T09-00-00-meal\.json is not a waiting meal/);
  });

  it('an unreadable meals.json is a problem, not a crash', () => {
    const c = buildMealsCard({ mealsText: '{ nope', pending: none, date: D, counting: 'allowed', goalG: null });
    assert.deepEqual(c.meals, []);
    assert.equal(c.problems.length, 1);
  });
});
