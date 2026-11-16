// The meal form drawn in Node with the small fake DOM: what it asks for,
// Save handing the words, the day and the time to the writer, the writer's
// checks marking their fields, and a save closing it. It shows no numbers:
// the coach estimates.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MealFormInput, MealSaveOutcome } from '../src/meal-writer.ts';
import { MealFormController } from '../src/ui/meal-form.ts';
import { FakeElement, installFakeDom, text } from './fake-dom.ts';

installFakeDom();

function form(outcome: MealSaveOutcome) {
  const calls: string[] = [];
  const got: MealFormInput[] = [];
  const c = new MealFormController({ date: '2026-04-12', at: '13:10' }, {
    save: async (i) => {
      got.push(i);
      return outcome;
    },
    saved: (id, photo) => void calls.push(`saved:${id}:${photo}`),
    close: () => void calls.push('close'),
  });
  const root = c.el as unknown as FakeElement;
  const field = (label: string) => root.querySelectorAll('input, textarea').find((x) => x.getAttribute('aria-label') === label) as FakeElement & { value: string };
  const type = (label: string, value: string) => {
    const f = field(label);
    f.value = value;
    for (const fn of f.listeners.get('input') ?? []) fn({ target: f });
  };
  const click = (sel: string) => {
    const b = root.querySelector(sel)!;
    assert.ok(b, sel);
    for (const fn of b.listeners.get('click') ?? []) fn({ target: b });
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { c, root, field, type, click, calls, got, settle };
}

describe('the meal form', () => {
  it('asks for the words, a photo, the day and the time; no number anywhere', () => {
    const { root, field } = form({ status: 'saved', id: 'x', photo: false });
    assert.equal(text(root.querySelector('.pv-nv-title')!), 'Log a meal');
    assert.ok(field('What you ate'));
    assert.ok(field('Meal photo'));
    assert.equal(field('Day').getAttribute('value'), '2026-04-12');
    assert.equal(field('Time').getAttribute('value'), '13:10');
    assert.doesNotMatch(text(root), /kcal|\d+ g\b/);
    assert.match(text(root), /never goes into git/);
  });

  it('Save hands the words, the day and the time over; a save says so and closes', async () => {
    const f = form({ status: 'saved', id: '2026-04-12T13-12-40', photo: false });
    f.type('What you ate', 'Chicken and rice');
    f.type('Time', '12:45');
    f.click('[data-k="meal-save"]');
    await f.settle();
    assert.deepEqual(f.got, [{ text: 'Chicken and rice', date: '2026-04-12', at: '12:45', photo: null }]);
    assert.deepEqual(f.calls, ['saved:2026-04-12T13-12-40:false', 'close']);
  });

  it('the writer\'s checks mark their fields and stay open', async () => {
    const f = form({ status: 'invalid', errors: [{ field: 'text', message: 'Say what you ate, or add a photo' }, { field: 'date', message: 'That day hasn’t come yet' }] });
    f.click('[data-k="meal-save"]');
    await f.settle();
    assert.ok(f.root.querySelector('[data-field="text"]')!.classList.contains('is-bad'));
    assert.ok(f.root.querySelector('[data-field="date"]')!.classList.contains('is-bad'));
    assert.match(text(f.root.querySelector('.pv-nv-msg')!), /Say what you ate, or add a photo; That day hasn’t come yet/);
    assert.deepEqual(f.calls, []);
  });

  it('a failed save says why and keeps what was typed', async () => {
    const f = form({ status: 'failed', error: 'the disk is full' });
    f.type('What you ate', 'Soup');
    f.click('[data-k="meal-save"]');
    await f.settle();
    assert.match(text(f.root.querySelector('.pv-nv-msg')!), /the disk is full/);
    assert.equal(text(f.root.querySelector('textarea')!), 'Soup');
  });
});
