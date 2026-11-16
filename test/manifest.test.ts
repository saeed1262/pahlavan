// manifest.json against the community directory's naming rules
// (docs.obsidian.md/Reference/Manifest): the directory delists a plugin whose
// name breaks them, so a bad name fails here before a release, not there.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from './helpers.ts';

/** Why a plugin name breaks the directory's rules, one reason each; empty when it's fine. */
export function nameProblems(name: string): string[] {
  const out: string[] = [];
  if (!/^[\x20-\x7e]+$/.test(name)) out.push('Basic Latin characters only');
  const punctuation = name.replace(/[A-Za-z0-9 \-+()]/g, '');
  if (punctuation) out.push(`no punctuation except hyphens, plus signs and parentheses (found ${JSON.stringify(punctuation)})`);
  if (/obsi|sidian/i.test(name)) out.push('no "Obsidian" or a variation of it');
  if (/plugin/i.test(name)) out.push('no "Plugin"');
  if (name.trim() !== name || name.trim() === '') out.push('not empty, no leading or trailing space');
  return out;
}

describe('manifest.json and the directory', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as Record<string, unknown>;

  it('has a name the directory accepts', () => {
    assert.equal(typeof manifest['name'], 'string');
    assert.deepEqual(nameProblems(manifest['name'] as string), []);
  });

  it('keeps the id the directory knows, and a description', () => {
    assert.equal(manifest['id'], 'pahlavan');
    assert.ok(typeof manifest['description'] === 'string' && (manifest['description'] as string).length > 0);
  });

  it('flags each kind of bad name', () => {
    assert.deepEqual(nameProblems('Pahlavan - Fitness Workout and Health Coach'), []);
    assert.deepEqual(nameProblems('Pahlavan (Fitness + Health)'), []);
    assert.equal(nameProblems('Pahlavan: Workout Coach').length, 1);
    assert.equal(nameProblems('Pahlavan, Workout').length, 1);
    assert.equal(nameProblems('Pahlavan for Obsidian').length, 1);
    assert.equal(nameProblems('Pahlavan Plugin').length, 1);
    assert.equal(nameProblems('Pahlavan 💪').length, 2);
  });
});
