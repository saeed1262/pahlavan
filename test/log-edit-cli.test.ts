// The engine's ways to do in chat what only Pahlavan's screens did: `log
// show`, `log edit` and `log delete` (a logged session read, changed or taken
// out, as the Log panel does it), `track pause`, `resume` and `remove` (the
// Habits screen's buttons), "I'm ill today" through `body`, and `folders`
// saying whether Pahlavan is in the vault. In-memory copies of the synthetic
// vault, and one run of the built engine on a temp copy with no .obsidian.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { run } from '../src/cli/cli.ts';
import { builtEngine, fixtureFiles, memoryIo, VAULT } from './helpers.ts';

type Json = Record<string, any>;
const TODAY = '2026-04-12';
const LOG = 'v/3-Personal/Fitness/fitness-log-data.json';
const HABITS = 'v/5-System/Data/habits-data.json';
const TRACKING = 'v/3-Personal/Fitness/Coach/tracking.json';
const BODY = 'v/3-Personal/Fitness/body-data.json';

function cli(argv: string[], edit: (f: Record<string, string>) => void = () => {}, today = TODAY) {
  const f = fixtureFiles('v');
  edit(f);
  const writes: string[] = [];
  const io = {
    ...memoryIo(f, today),
    writeLog: (_root: string, text: string) => { writes.push('log'); f[LOG] = text; },
    writeHabits: (_root: string, text: string) => { writes.push('habits'); f[HABITS] = text; },
    writeTracking: (_root: string, text: string) => { writes.push('tracking'); f[TRACKING] = text; },
    writeBody: (_root: string, text: string) => { writes.push('body'); f[BODY] = text; },
  };
  const r = run([...argv, '--vault', 'v'], io as never);
  return { code: r.code, out: JSON.parse(r.stdout) as Json, writes, files: f };
}
const sessions = (f: Record<string, string>) => (JSON.parse(f[LOG]!) as Json).sessions as Json[];
const at = (f: Record<string, string>, date: string, type: string) => sessions(f).find((s) => s.date === date && s.type === type);

describe('log show', () => {
  it('a session as log edit takes it, with its checklist lines; reads only', () => {
    const r = cli(['log', 'show', '--date', '2026-04-08', '--type', 'A']);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(r.out.session.date, '2026-04-08');
    assert.ok(!('type' in r.out.input) && !('label' in r.out.input) && !('express' in r.out.input), 'the flags name those');
    assert.ok(Array.isArray(r.out.input.skipped));
    assert.ok(r.out.lines.length > 0 && r.out.lines.every((x: unknown) => typeof x === 'string'));
    assert.deepEqual(r.writes, []);
    assert.equal(cli(['log', 'show', '--date', '2026-04-08', '--type', 'A', '--write']).code, 2);
  });

  it('a session that is not there: what that day holds instead', () => {
    const r = cli(['log', 'show', '--date', '2026-04-10', '--type', 'A']);
    assert.equal(r.code, 1);
    assert.equal(r.out.errors[0].code, 'missing');
    assert.match(r.out.errors[0].message, /that day holds custom "Easy run"/);
    assert.equal(cli(['log', 'show', '--date', '2026-04-08']).code, 2, '--type is needed');
  });
});

describe('log edit', () => {
  const edit = (patch: unknown, argv: string[] = ['--date', '2026-04-08', '--type', 'A'], more: string[] = []) =>
    cli(['log', 'edit', ...argv, '--file', 'v/e.json', ...more], (f) => { f['v/e.json'] = JSON.stringify(patch); });

  it("show's input back as it is: unchanged, nothing written", () => {
    const shown = cli(['log', 'show', '--date', '2026-04-08', '--type', 'A']).out.input;
    const r = edit(shown, undefined, ['--write']);
    assert.deepEqual([r.code, r.out.result, r.out.written, r.writes], [0, 'unchanged', false, []]);
  });

  it('a changed field: a dry run names it; --write saves it, reads it back and ticks the Workout habit', () => {
    const dry = edit({ notes: 'left knee fine' });
    assert.equal(dry.code, 0, JSON.stringify(dry.out.errors));
    assert.deepEqual([dry.out.result, dry.out.changed, dry.out.dryRun, dry.writes], ['updated', ['notes'], true, []]);
    assert.equal(dry.out.session.notes, 'left knee fine');
    const wet = edit({ notes: 'left knee fine' }, undefined, ['--write']);
    assert.deepEqual([wet.code, wet.out.written, wet.writes[0]], [0, true, 'log']);
    assert.ok(['ticked', 'already ticked'].includes(wet.out.habit));
    const s = at(wet.files, '2026-04-08', 'A')!;
    assert.equal(s.notes, 'left knee fine');
    assert.deepEqual(s.exercises, at(fixtureFiles('v'), '2026-04-08', 'A')!.exercises, 'the frozen list stays with the date');
    assert.equal(sessions(wet.files).length, sessions(fixtureFiles('v')).length);
  });

  it('the skipped lines rebuild the checklist from the session’s own lines; a name not among them is refused', () => {
    const lines: string[] = cli(['log', 'show', '--date', '2026-04-08', '--type', 'A']).out.lines;
    const r = edit({ skipped: [lines[0]], skipWhy: { [lines[0]!]: 'time' } }, undefined, ['--write']);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    const ck = at(r.files, '2026-04-08', 'A')!.checklist;
    assert.deepEqual([ck.total, ck.done, ck.skipped, ck.why], [lines.length, lines.length - 1, [lines[0]], { [lines[0]!]: 'time' }]);
    // An older checklist's paired line stands for its parts in the frozen list.
    const pair = edit({ skipped: ['Face Pull + Band External Rotation', 'Zone 2 finisher'], skipWhy: { 'Zone 2 finisher': 'energy' } });
    assert.equal(pair.code, 0, JSON.stringify(pair.out.errors));
    assert.deepEqual(pair.out.session.checklist, { done: 2, total: 5, skipped: ['Face Pull', 'Band External Rotation', 'Zone 2 finisher'], why: { 'Zone 2 finisher': 'energy' } });
    const bad = edit({ skipped: ['Not a line'] });
    assert.equal(bad.code, 1);
    assert.match(bad.out.errors[0].message, /not a line of this session; its lines:/);
    const stray = edit({ skipped: [], skipWhy: { [lines[0]!]: 'time' } });
    assert.match(stray.out.errors[0].message, /a line not skipped/);
  });

  it('the type, label and Express are not edited; a future date and a move onto another session are refused', () => {
    const t = edit({ type: 'B' });
    assert.equal(t.code, 1);
    assert.match(t.out.errors[0].message, /log delete it, then log add it/);
    assert.match(edit({ date: '2026-05-01' }).out.errors[0].message, /in the future/);
    const clash = edit({ date: '2026-04-06' }, ['--date', '2026-04-11', '--type', 'B']);
    assert.deepEqual([clash.code, clash.out.errors[0].code], [1, 'already']);
    assert.match(edit({}).out.errors[0].message, /changes nothing/);
  });

  it('a custom session by its label', () => {
    const r = edit({ durationMin: 35 }, ['--date', '2026-04-10', '--type', 'custom', '--label', 'Easy run'], ['--write']);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(at(r.files, '2026-04-10', 'custom')!.durationMin, 35);
    assert.equal(edit({ durationMin: 35 }, ['--date', '2026-04-10', '--type', 'custom']).out.errors[0].code, 'missing');
  });
});

describe('log delete', () => {
  it('a dry run unless --write; it takes the one session out and leaves the Workout tick', () => {
    const argv = ['log', 'delete', '--date', '2026-04-10', '--type', 'custom', '--label', 'Easy run'];
    const dry = cli(argv);
    assert.deepEqual([dry.code, dry.out.result, dry.writes], [0, 'deleted', []]);
    const wet = cli([...argv, '--write']);
    assert.deepEqual([wet.code, wet.out.written, wet.writes], [0, true, ['log']]);
    assert.equal(sessions(wet.files).length, sessions(fixtureFiles('v')).length - 1);
    assert.equal(at(wet.files, '2026-04-10', 'custom'), undefined);
    assert.equal(wet.files[HABITS], fixtureFiles('v')[HABITS]);
    const again = cli(argv, (f) => { f[LOG] = wet.files[LOG]!; });
    assert.equal(again.out.errors[0].code, 'missing');
  });
});

describe('track pause, resume and remove', () => {
  const DATE = '2026-04-10';
  const track = (argv: string[]) => cli(['track', ...argv], undefined, DATE);
  const item = (f: Record<string, string>, id: string) => (JSON.parse(f[TRACKING]!) as Json).items.find((x: Json) => x.id === id);

  it('pause from today, as the Habits screen does; a second pause is unchanged', () => {
    const r = track(['pause', '--id', 'creatine', '--write']);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.deepEqual([r.out.results[0].result, r.writes], ['paused', ['tracking']]);
    assert.deepEqual(item(r.files, 'creatine').pauses, [{ from: DATE }]);
    const again = cli(['track', 'pause', '--id', 'fish-oil', '--write'], undefined, DATE);
    assert.deepEqual([again.out.results[0].result, again.writes], ['unchanged', []]);
  });

  it('resume ends the open pause yesterday; an item not paused is unchanged', () => {
    const r = track(['resume', '--id', 'fish-oil', '--write']);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(r.out.results[0].result, 'resumed');
    assert.deepEqual(item(r.files, 'fish-oil').pauses, [{ from: '2026-03-28', to: '2026-04-09' }]);
    assert.equal(track(['resume', '--id', 'creatine']).out.results[0].result, 'unchanged');
  });

  it('remove takes the item and its day records out; an unknown id is refused', () => {
    const r = track(['remove', '--id', 'creatine', '--write']);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.equal(r.out.results[0].result, 'removed');
    const doc = JSON.parse(r.files[TRACKING]!) as Json;
    assert.equal(item(r.files, 'creatine'), undefined);
    assert.ok(Object.values(doc.days as Record<string, Json>).every((d) => !('creatine' in d)));
    const bad = track(['remove', '--id', 'nope']);
    assert.equal(bad.code, 1);
    assert.match(bad.out.errors[0].message, /no tracked item with the id nope/);
    assert.equal(track(['remove']).code, 2);
  });

  it('several in one apply file', () => {
    const r = cli(['track', 'apply', '--file', 'v/c.json', '--write'], (f) => { f['v/c.json'] = JSON.stringify({ pause: ['multivitamin'], resume: ['fish-oil'], remove: ['shake'] }); }, DATE);
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.deepEqual(r.out.results.map((x: Json) => x.result), ['paused', 'resumed', 'removed']);
  });
});

describe('body: "I\'m ill today"', () => {
  const body = (morning: unknown, more: string[] = ['--write']) => cli(['body', '--file', 'v/b.json', ...more], (f) => { f['v/b.json'] = JSON.stringify({ date: '2026-04-11', morning }); });

  it('true sets the day’s illness, as the morning check-in does; false takes it off', () => {
    const r = body({ illness: true, energy: 2 });
    assert.equal(r.code, 0, JSON.stringify(r.out.errors));
    assert.deepEqual(r.out.results[0].changed.includes('illness'), true);
    assert.equal(r.out.after.illness, true);
    assert.equal((JSON.parse(r.files[BODY]!) as Json).days['2026-04-11'].illness, true);
    const off = cli(['body', '--file', 'v/b.json', '--write'], (f) => { f[BODY] = r.files[BODY]!; f['v/b.json'] = JSON.stringify({ date: '2026-04-11', morning: { illness: false } }); });
    assert.equal(off.code, 0, JSON.stringify(off.out.errors));
    assert.equal('illness' in (JSON.parse(off.files[BODY]!) as Json).days['2026-04-11'], false);
  });

  it('anything but true or false is refused', () => {
    const r = body({ illness: 'yes' }, []);
    assert.equal(r.code, 1);
    assert.match(r.out.errors[0].message, /morning.illness/);
  });
});

describe('folders: whether Pahlavan is in the vault', () => {
  it('false without its files, true with them', () => {
    assert.equal(cli(['folders']).out.pahlavan, false);
    const r = cli(['folders'], (f) => { f['v/.obsidian/plugins/pahlavan/manifest.json'] = '{"id": "pahlavan", "version": "0.29.0"}'; });
    assert.equal(r.out.pahlavan, true);
  });
});

/** Every file's name and text: any write shows. */
function snapshot(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of readdirSync(dir, { recursive: true }) as string[]) {
    const p = join(dir, f);
    if (statSync(p).isFile()) m.set(f, readFileSync(p, 'utf8'));
  }
  return m;
}

describe('the built engine in a folder with no .obsidian', () => {
  it('folders says no Pahlavan; log edit and delete change the log and nothing else', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pahlavan-plain-'));
    try {
      const vault = join(tmp, 'folder');
      cpSync(VAULT, vault, { recursive: true });
      rmSync(join(vault, '.obsidian'), { recursive: true, force: true });
      const engine = (...argv: string[]) => {
        const r = spawnSync(process.execPath, [builtEngine(), ...argv, '--vault', vault], { encoding: 'utf8' });
        return { status: r.status, out: JSON.parse(r.stdout) as Json, stderr: r.stderr };
      };
      assert.equal(engine('folders').out.pahlavan, false);
      const edit = join(tmp, 'edit.json');
      writeFileSync(edit, JSON.stringify({ notes: 'edited in chat' }));
      const before = snapshot(vault);
      const r = engine('log', 'edit', '--date', '2026-04-08', '--type', 'A', '--file', edit, '--no-habit', '--write');
      assert.equal(r.status, 0, JSON.stringify(r.out.errors) + r.stderr);
      const d = engine('log', 'delete', '--date', '2026-04-10', '--type', 'custom', '--label', 'Easy run', '--write');
      assert.equal(d.status, 0, JSON.stringify(d.out.errors) + d.stderr);
      const after = snapshot(vault);
      assert.deepEqual([...after.keys()].filter((k) => after.get(k) !== before.get(k)), ['3-Personal/Fitness/fitness-log-data.json']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
