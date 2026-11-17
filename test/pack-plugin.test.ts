// coach/, the coach as a Claude Code plugin (npm run pack-plugin), and the
// repository's .claude-plugin/marketplace.json that lists it. coach/ is
// committed, so these fail while it is behind skill/ or the version: run
// npm run pack-plugin. The file rules are Anthropic's directory's.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from './helpers.ts';

const COACH = join(ROOT, 'coach');
const SKILL = join(COACH, 'skills', 'fitness-coach');
const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const json = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, any>;
const filesIn = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? filesIn(join(dir, n)) : [join(dir, n)]));

describe('coach/, the plugin', () => {
  it('holds skill/ as it is now (run npm run pack-plugin after changing it)', () => {
    const source = join(ROOT, 'skill');
    for (const f of filesIn(source)) {
      const rel = relative(source, f);
      assert.ok(readFileSync(join(SKILL, rel), 'utf8') === readFileSync(f, 'utf8'), `coach/skills/fitness-coach/${rel} differs from skill/${rel}`);
    }
  });

  it('carries the engine of this version', () => {
    assert.match(readFileSync(join(SKILL, 'scripts', 'VERSION'), 'utf8'), new RegExp(`^engine ${version.replace(/\./g, '\\.')}\\n`));
    // shortcut: the banner names the version, not the code; an engine change without a version change isn't caught here.
    assert.match(readFileSync(join(SKILL, 'scripts', 'engine.cjs'), 'utf8').split('\n')[1]!, new RegExp(`^// pahlavan ${version.replace(/\./g, '\\.')} `));
  });

  it('has a manifest the directory takes', () => {
    const p = json(join(COACH, '.claude-plugin', 'plugin.json'));
    assert.match(p.name, /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/);
    assert.equal(p.version, version);
    assert.ok(p.description && p.author?.name && p.license, 'description, author and license');
    for (const k of ['homepage', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl']) assert.match(p[k], /^https:\/\//, k);
    assert.ok(statSync(join(COACH, 'LICENSE')).size > 0);
    assert.equal(p.icon, './icon.png');
    assert.ok(statSync(join(COACH, 'icon.png')).size < 2 * 1024 * 1024);
    // GitHub's web upload refuses hidden folders, so .claude-plugin/ holds only text that can be pasted in.
    assert.deepEqual(readdirSync(join(COACH, '.claude-plugin')), ['plugin.json']);
  });

  it('has a README of 40 words or more, with no em dashes', () => {
    const text = readFileSync(join(COACH, 'README.md'), 'utf8');
    assert.ok(text.split(/\s+/).length >= 40);
    assert.ok(!text.includes('—'));
  });

  it('keeps to the directory file rules: under 512 files, no Finder files, text under 256 KiB (the engine excepted)', () => {
    const files = filesIn(COACH);
    assert.ok(files.length < 512, `${files.length} files`);
    for (const f of files) {
      const rel = relative(COACH, f);
      assert.ok(!/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(rel), rel);
      // The bundled engine (about 1.2 MB) is over the limit: the directory holds it for a reviewer, it doesn't refuse it.
      if (!rel.endsWith('.png') && rel !== 'skills/fitness-coach/scripts/engine.cjs') assert.ok(statSync(f).size < 256 * 1024, `${rel} is ${statSync(f).size} bytes`);
    }
  });
});

describe('.claude-plugin/marketplace.json', () => {
  it('lists the plugin in coach/ under its own name', () => {
    const m = json(join(ROOT, '.claude-plugin', 'marketplace.json'));
    const p = json(join(COACH, '.claude-plugin', 'plugin.json'));
    assert.ok(m.name && m.owner?.name && m.description);
    assert.equal(m.plugins.length, 1);
    assert.equal(m.plugins[0].source, './coach');
    assert.equal(m.plugins[0].name, p.name);
  });
});
