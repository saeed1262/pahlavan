// The meal form's writer on the in-memory vault: a waiting meal saved in
// Coach/Inbox/meals/ (the photo converted and written before the entry,
// both read back, the .gitignore made once), the form's checks, a HEIC that
// couldn't be converted refused, and a waiting meal taken out again. The
// file watcher redraws on an entry, never on its photo.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paths } from '../../src/adapters/vault/layout.ts';
import { validatePendingMeal } from '../../src/core/validate.ts';
import { PENDING_GITIGNORE } from '../../src/report/meal-pending.ts';
import { isPendingWatched, isWatched } from '../src/data-source.ts';
import { MealFormWriter, type PhotoConvert } from '../src/meal-writer.ts';
import { bytes, memVault, text } from './mem-vault.ts';

const TODAY = '2026-04-12';
const NOW = { date: TODAY, time: '13:12:40' };
const ID = '2026-04-12T13-12-40';
const dir = () => paths().pendingMeals;

/** sips as the tests have it: any photo comes back a JPEG, its bytes marked. */
const toJpeg: PhotoConvert = async (p) => ({ data: bytes(`JPEG of ${p.name}`), ext: 'jpeg' });
/** No sips (another system): the photo as it is. */
const asIs: PhotoConvert = async (p) => ({ data: p.data, ext: (/\.([a-z0-9]+)$/i.exec(p.name)?.[1] ?? 'jpeg').toLowerCase() });

const lunch = { text: 'Chicken, rice and salad; a palm of chicken', date: TODAY, at: '13:10' };

describe('MealFormWriter.save', () => {
  it('a meal with a photo: the folder and its .gitignore made, the JPEG first, then the entry, valid', async () => {
    const v = memVault();
    const order: string[] = [];
    const adapter = { ...v.adapter, writeBinary: async (p: string, d: ArrayBuffer) => { order.push(p); await v.adapter.writeBinary!(p, d); }, write: async (p: string, d: string) => { order.push(p); await v.adapter.write(p, d); } };
    const w = new MealFormWriter(adapter, toJpeg);
    const r = await w.save({ ...lunch, photo: { name: 'IMG_0412.HEIC', data: bytes('heic bytes') } }, NOW, TODAY);
    assert.deepEqual(r, { status: 'saved', id: ID, photo: true });
    assert.deepEqual(order, [`${dir()}/.gitignore`, `${dir()}/${ID}-meal.jpeg`, `${dir()}/${ID}-meal.json`], 'the photo lands before the entry that names it');
    assert.equal(v.files.get(`${dir()}/.gitignore`), PENDING_GITIGNORE);
    assert.equal(text(v.binaries.get(`${dir()}/${ID}-meal.jpeg`)), 'JPEG of IMG_0412.HEIC');
    const entry = v.json(`${dir()}/${ID}-meal.json`);
    assert.deepEqual(entry, { v: 1, date: TODAY, at: '13:10', text: lunch.text, photo: `${ID}-meal.jpeg`, made: `${TODAY}T13:12:40` });
    assert.deepEqual(validatePendingMeal(entry, `${ID}-meal.json`), []);
  });

  it('words alone: no photo written; a second save keeps the .gitignore as it is', async () => {
    const v = memVault();
    const w = new MealFormWriter(v.adapter, toJpeg);
    await w.save({ ...lunch, photo: null }, NOW, TODAY);
    const r = await w.save({ ...lunch, text: 'An apple', photo: null }, NOW, TODAY);
    assert.deepEqual(r, { status: 'saved', id: `${ID}-2`, photo: false }, 'the same second: a counter');
    assert.equal(v.binaries.size, 0);
    assert.equal(v.writes.filter((x) => x.path.endsWith('.gitignore')).length, 1);
  });

  it('the form\'s checks come back by field, and nothing is written', async () => {
    const v = memVault();
    const w = new MealFormWriter(v.adapter, toJpeg);
    const r = await w.save({ text: '  ', date: '2026-04-13', at: '9', photo: null }, NOW, TODAY);
    assert.equal(r.status, 'invalid');
    assert.deepEqual(r.status === 'invalid' && r.errors.map((e) => e.field), ['text', 'date', 'at']);
    assert.equal(v.writes.length, 0);
  });

  it('a HEIC that couldn\'t be converted is refused: the coach can\'t read it', async () => {
    const v = memVault();
    const r = await new MealFormWriter(v.adapter, asIs).save({ ...lunch, photo: { name: 'IMG_0412.HEIC', data: bytes('heic') } }, NOW, TODAY);
    assert.equal(r.status, 'invalid');
    assert.deepEqual(r.status === 'invalid' && r.errors.map((e) => e.field), ['photo']);
    assert.match(r.status === 'invalid' ? r.errors[0]!.message : '', /JPEG/);
    assert.equal(v.writes.length + v.binaries.size, 0);
  });

  it('without sips a JPEG or PNG is saved as it is', async () => {
    const v = memVault();
    const r = await new MealFormWriter(v.adapter, asIs).save({ ...lunch, photo: { name: 'lunch.png', data: bytes('png') } }, NOW, TODAY);
    assert.deepEqual(r, { status: 'saved', id: ID, photo: true });
    assert.equal(text(v.binaries.get(`${dir()}/${ID}-meal.png`)), 'png');
  });

  it('an entry that doesn\'t read back is taken out again, its photo too', async () => {
    const v = memVault();
    const adapter = { ...v.adapter, read: async (p: string) => (p.endsWith('-meal.json') ? 'not what was written' : v.adapter.read(p)) };
    const r = await new MealFormWriter(adapter, toJpeg).save({ ...lunch, photo: { name: 'a.jpg', data: bytes('x') } }, NOW, TODAY);
    assert.equal(r.status, 'failed');
    assert.deepEqual(v.removed.sort(), [`${dir()}/${ID}-meal.jpeg`, `${dir()}/${ID}-meal.json`]);
  });
});

describe('MealFormWriter.remove', () => {
  it('takes the entry out, then its photo; the .gitignore stays; gone when there is nothing', async () => {
    const v = memVault();
    const w = new MealFormWriter(v.adapter, toJpeg);
    await w.save({ ...lunch, photo: { name: 'a.jpg', data: bytes('x') } }, NOW, TODAY);
    assert.deepEqual(await w.remove(ID), { status: 'removed' });
    assert.deepEqual(v.removed, [`${dir()}/${ID}-meal.json`, `${dir()}/${ID}-meal.jpeg`]);
    assert.ok(v.files.has(`${dir()}/.gitignore`));
    assert.deepEqual(await w.remove(ID), { status: 'gone' });
  });
});

describe('the file watcher', () => {
  it('redraws on a waiting meal\'s entry and on meals.json, never on its photo', () => {
    assert.equal(isPendingWatched(`${dir()}/${ID}-meal.json`), true);
    assert.equal(isPendingWatched(`${dir()}/${ID}-meal.jpeg`), false);
    assert.equal(isPendingWatched(`${dir()}/.gitignore`), false);
    assert.equal(isWatched(paths().meals), true);
    assert.equal(isWatched(`${dir()}/${ID}-meal.json`), true);
  });
});
