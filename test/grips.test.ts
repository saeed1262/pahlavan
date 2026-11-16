// Grips: the catalogue movements whose grip changes the path list their
// grips (data/exercises.ts GRIPS), a plan item names one in parentheses, and
// the vault adapter reads it (catalogue-match.ts gripOf). The catalogue's
// muscles still count, and the name keeps its own history.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gripOf } from '../src/adapters/vault/catalogue-match.ts';
import { readVault } from '../src/adapters/vault/read.ts';
import { CATALOGUE, CATALOGUE_BY_ID, GRIP_IDS, GRIPS } from '../src/core/data/exercises.ts';
import { exerciseId, type ExerciseExtras } from '../src/core/plan-data.ts';
import { catalogueMarkdown } from '../src/report/catalogue-doc.ts';
import { searchCatalogue } from '../src/report/catalogue.ts';
import { catalogueGuide } from '../src/report/movements-screen.ts';
import { fixtureFiles, memoryIo } from './helpers.ts';

type Json = Record<string, any>;
const PLAN = 'v/3-Personal/Fitness/plan-data.json';
const entry = (id: string) => CATALOGUE_BY_ID.get(id)!;

function vault(edit: (plan: Json) => void) {
  const files = fixtureFiles('v');
  const plan = JSON.parse(files[PLAN]!);
  edit(plan);
  files[PLAN] = JSON.stringify(plan);
  return readVault(memoryIo(files), 'v', { asOf: '2026-04-20' }).data;
}

describe('the catalogue\'s grips', () => {
  const withGrips = CATALOGUE.filter((e) => e.grips);

  it('about fifteen movements, each grip in the vocabulary, each other grip once and not the guide\'s own', () => {
    assert.ok(withGrips.length >= 12 && withGrips.length <= 20, `${withGrips.length} movements with grips`);
    for (const e of withGrips) {
      const g = e.grips!;
      assert.ok(GRIP_IDS.includes(g.default), `${e.id}: ${g.default}`);
      assert.ok(g.options.length > 0, `${e.id} lists another grip`);
      const ids = g.options.map((o) => o.grip);
      assert.equal(new Set(ids).size, ids.length, `${e.id}: each grip once`);
      assert.ok(!ids.includes(g.default), `${e.id}: the guide's grip is not repeated as another`);
      for (const o of g.options) {
        assert.ok(GRIP_IDS.includes(o.grip), `${e.id}: ${o.grip}`);
        assert.ok(o.setup.length > 20 && !o.setup.includes('—'), `${e.id} ${o.grip}: a setup line`);
      }
    }
  });

  it('only pulls, presses and curls: the patterns where a grip changes the path', () => {
    const patterns = new Set(withGrips.map((e) => e.pattern));
    for (const p of patterns) assert.ok(['vertical-pull', 'horizontal-pull', 'horizontal-push', 'vertical-push', 'biceps'].includes(p), p);
  });
});

describe('the grip a name gives (gripOf)', () => {
  const pulldown = entry('lat-pulldown');

  it('the guide\'s own grip with nothing in parentheses', () => {
    assert.deepEqual(gripOf('Lat Pulldown', pulldown), { grip: 'overhand' });
    assert.deepEqual(gripOf('Lat Pulldown (2-s lowering)', pulldown), { grip: 'overhand' }, 'parentheses that name no grip');
  });

  it('a grip named in parentheses, in any case or spelling', () => {
    assert.deepEqual(gripOf('Lat Pulldown (close neutral grip)', pulldown), { grip: 'close-neutral' });
    assert.deepEqual(gripOf('Lat Pulldown (Close-Neutral Grip)', pulldown), { grip: 'close-neutral' });
    assert.deepEqual(gripOf('Lat Pulldown (narrow neutral grip)', pulldown), { grip: 'close-neutral' });
    assert.deepEqual(gripOf('Lat Pulldown (underhand)', pulldown), { grip: 'underhand' });
    assert.deepEqual(gripOf('Lat Pulldown (supinated grip)', pulldown), { grip: 'underhand' });
  });

  it('a width alone takes the movement\'s own turn of the hands', () => {
    assert.deepEqual(gripOf('Barbell Bench Press (close grip)', entry('bench-press')), { grip: 'close-overhand' });
  });

  it('a grip the movement does not list: unknown, and its own grip stands', () => {
    assert.deepEqual(gripOf('Lat Pulldown (wide grip)', pulldown), { grip: 'overhand', unknown: 'wide grip' });
  });

  it('a movement with no grips has none', () => {
    assert.deepEqual(gripOf('Goblet Squat (heels raised)', entry('goblet-squat')), { grip: null });
    assert.deepEqual(gripOf('Anything', null), { grip: null });
  });
});

describe('a grip in a plan name, through the vault adapter', () => {
  const NAME = 'Lat Pulldown (close neutral grip)';
  const data = vault((p) => p.sessions.B.push({ name: NAME, sr: '3 × 10–12', rest: '90 s' }));
  const id = exerciseId(NAME);

  it('keeps the catalogue\'s movement, muscles and pattern, and reads the grip', () => {
    assert.equal(data.catalogueMatch[id], 'lat-pulldown');
    const ex = data.program.exercises[id]!;
    assert.equal(ex.pattern, 'vertical-pull');
    assert.deepEqual(ex.muscles?.main, entry('lat-pulldown').muscles.main);
    assert.equal((ex as ExerciseExtras)._grip, 'close-neutral');
  });

  it('has its own history id, apart from the plain name\'s', () => {
    assert.notEqual(id, exerciseId('Lat Pulldown'));
    assert.ok(!data.sessions.some((s) => s.exercises.some((x) => x.exercise === id)), 'nothing logged under the new name yet');
  });

  it('a grip the movement does not list is said once, with the grips it has', () => {
    const d = vault((p) => p.sessions.B.push({ name: 'Lat Pulldown (wide grip)', sr: '3 × 10–12' }));
    const w = d.warnings.find((x) => x.code === 'grip-unknown');
    assert.ok(w, 'grip-unknown');
    assert.match(w!.items![0]!, /^Lat Pulldown \(wide grip\): "wide grip" \(overhand grip, close neutral grip, underhand grip\)$/);
    assert.ok(!vault(() => {}).warnings.some((x) => x.code === 'grip-unknown'), 'the fixture has none');
  });
});

describe('where the grips show', () => {
  it('the catalogue page lists each movement\'s grips under its setup', () => {
    const md = catalogueMarkdown();
    assert.match(md, /### Lat pulldown[\s\S]*?- \*\*Grips:\*\* overhand grip \(the setup above\); close neutral grip: Thighs locked/);
    const goblet = md.split('### Goblet squat\n')[1]!.split('\n### ')[0]!;
    assert.ok(!goblet.includes('**Grips:**'), 'a movement with no grips has no line');
  });

  it('the Movements screen\'s guide says them', () => {
    const view = searchCatalogue({}).movements.find((v) => v.id === 'lat-pulldown')!;
    assert.equal(catalogueGuide(view).grips, 'Overhand grip (as set up), or close neutral grip, underhand grip: name one in parentheses in your plan');
    const squat = searchCatalogue({}).movements.find((v) => v.id === 'goblet-squat')!;
    assert.equal(catalogueGuide(squat).grips, undefined, 'no grips line, and no key');
  });

  it('the vocabulary\'s labels end in "grip"', () => {
    for (const g of GRIP_IDS) assert.match(GRIPS[g].label, / grip$/);
  });
});

describe('engine catalogue', () => {
  it('lists a movement\'s grips, and the vocabulary says what each grip is', () => {
    const r = searchCatalogue({ query: 'pulldown' });
    const v = r.movements.find((m) => m.id === 'lat-pulldown')!;
    assert.deepEqual(v.grips!.default, 'overhand');
    assert.deepEqual(v.grips!.options.map((o) => o.grip), ['close-neutral', 'underhand']);
    assert.equal(r.movements.find((m) => m.id === 'straight-arm-pulldown')?.grips, undefined);
    assert.deepEqual(r.vocabulary.grips.map((g) => g.id), GRIP_IDS);
  });
});
