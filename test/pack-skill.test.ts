// tools/pack-skill.mjs: the coach without Obsidian as one zip, a Pahlavan
// folder with the skill where Claude Code finds it and a START HERE.md. Built
// once into a temp folder (it needs the Mac's /usr/bin/zip).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from './helpers.ts';

describe('npm run pack-skill', () => {
  it('zips a Pahlavan folder: the skill under .claude/skills/fitness-coach, its engine and VERSION, and START HERE.md', { skip: !existsSync('/usr/bin/zip') && 'no /usr/bin/zip here' }, () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pahlavan-packtest-'));
    try {
      const zip = join(tmp, 'coach.zip');
      const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'pack-skill.mjs'), '--out', zip], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, INIT_CWD: ROOT } });
      assert.equal(r.status, 0, r.stderr + r.stdout);
      const list = spawnSync('/usr/bin/unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
      for (const f of ['Pahlavan/START HERE.md', 'Pahlavan/.claude/skills/fitness-coach/SKILL.md', 'Pahlavan/.claude/skills/fitness-coach/references/today.md', 'Pahlavan/.claude/skills/fitness-coach/scripts/engine.cjs', 'Pahlavan/.claude/skills/fitness-coach/scripts/VERSION']) assert.ok(list.includes(f), `${f} in ${list.join(', ')}`);
      assert.ok(list.every((f) => f.startsWith('Pahlavan/') && !f.endsWith('/')), 'one top folder, no directory entries');
      const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
      const shipped = spawnSync('/usr/bin/unzip', ['-p', zip, 'Pahlavan/.claude/skills/fitness-coach/scripts/VERSION'], { encoding: 'utf8' }).stdout;
      assert.match(shipped, new RegExp(`^engine ${version.replace(/\./g, '\\.')}\\n`));
      const start = spawnSync('/usr/bin/unzip', ['-p', zip, 'Pahlavan/START HERE.md'], { encoding: 'utf8' }).stdout;
      for (const c of ['/fitness-coach intake', '/fitness-coach today', '/fitness-coach log', '/fitness-coach checkin']) assert.ok(start.includes(c), c);
      assert.ok(!start.includes('—'), 'no em dashes');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
