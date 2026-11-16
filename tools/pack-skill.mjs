// npm run pack-skill [-- --out <file.zip>]
// The coach without Obsidian, as one zip for the release: a folder named
// Pahlavan holding the skill where Claude Code finds it
// (.claude/skills/fitness-coach/, installed by ship-skill: the text, the
// self-check and the built engine) and a START HERE.md. Unzipped, the folder
// is ready: open it in Claude Code and run /fitness-coach intake. The same
// folder opens as an Obsidian vault later, and Pahlavan reads its files.
//
// The zip comes from the Mac's own /usr/bin/zip (no new dependency), with a
// sorted file list, no directory entries, no extra attributes and every
// file's time fixed, so the same build gives the same zip. It goes up with
// the release's other files on the GitHub website; nothing here uploads.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const unknown = args.filter((a, i) => a.startsWith('-') && a !== '--out' && !(outAt >= 0 && i === outAt + 1));
if (unknown.length || (outAt >= 0 && (!args[outAt + 1] || args[outAt + 1].startsWith('-')))) {
  console.error('usage: npm run pack-skill [-- --out <file.zip>]   (default: dist/pahlavan-coach-<version>.zip)');
  process.exit(2);
}
const ZIP = '/usr/bin/zip';
if (!existsSync(ZIP)) {
  console.error(`pack-skill: ${ZIP} is not here (a Mac has it): the zip can't be made`);
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const out = outAt >= 0 ? resolve(process.env.INIT_CWD ?? process.cwd(), args[outAt + 1]) : join(root, 'dist', `pahlavan-coach-${version}.zip`);

/** What START HERE.md says: the two steps, the touchpoints, what it needs, and the screens for later. */
export const START_HERE = `# Pahlavan: your training coach in Claude Code

This folder is where your coach keeps your plan, your log and its notes.

1. Open this folder in Claude Code: \`cd\` into it and run \`claude\`, or open it in the Claude app's Code tab.
2. Type \`/fitness-coach intake\`. The coach asks about you and your training, then offers to design your plan (\`/fitness-coach plan\`).

Then, each with its command:

- every morning: \`/fitness-coach today\` (today's session, what's due, a short morning check-in)
- after training: \`/fitness-coach log\` (for example "did A, squat 60 x 8")
- Sundays: \`/fitness-coach checkin\` (the week's review and your coach's letter)

It needs Node.js 18 or later (\`node --version\`) and a Claude plan that includes Claude Code. Your files stay in this folder; when you talk to the coach, Claude Code sends your messages and the files it reads to Anthropic under your own account.

Later, to see your plan, log and progress on screens: open this folder as a vault in Obsidian and install Pahlavan from Community plugins. It reads the same files.

Pahlavan is a general fitness tool for adults 18 and over, not medical advice. If you have a health condition, check with a doctor before you start, and stop any exercise that hurts.

Step by step, from installing Node.js and Claude Code to your first week: https://github.com/saeed1262/pahlavan/blob/main/docs/without-obsidian.md

The whole guide: https://github.com/saeed1262/pahlavan
`;

const tmp = mkdtempSync(join(tmpdir(), 'pahlavan-pack-'));
try {
  const folder = join(tmp, 'Pahlavan');
  const skill = join(folder, '.claude', 'skills', 'fitness-coach');
  mkdirSync(dirname(skill), { recursive: true });
  // ship-skill builds the engine and installs the skill; its self-check needs a fitness folder, which a new folder doesn't have yet.
  const ship = spawnSync(process.execPath, [join(root, 'tools', 'ship-skill.mjs'), skill, '--no-check'], { cwd: root, stdio: 'inherit', env: { ...process.env, INIT_CWD: root } });
  if (ship.status !== 0) process.exit(ship.status ?? 1);
  writeFileSync(join(folder, 'START HERE.md'), START_HERE);

  // Every file's path inside the zip, sorted, each with the same time (2026-01-01 00:00 UTC).
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(relative(tmp, p));
    }
  };
  walk(folder);
  const when = new Date(Date.UTC(2026, 0, 1));
  for (const f of files) utimesSync(join(tmp, f), when, when);
  mkdirSync(dirname(out), { recursive: true });
  rmSync(out, { force: true });
  // -X: no extra attributes; -D: no directory entries; -@: the names from stdin, in this order.
  const zip = spawnSync(ZIP, ['-q', '-X', '-D', out, '-@'], { cwd: tmp, input: files.join('\n'), env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' });
  if (zip.status !== 0) {
    console.error(`pack-skill: zip failed: ${zip.stderr}`);
    process.exit(1);
  }
  const bytes = readFileSync(out);
  console.log(`pack-skill: ${relative(process.cwd(), out) || out} (${files.length} files, ${(bytes.length / 1024).toFixed(0)} KB, sha256 ${createHash('sha256').update(bytes).digest('hex')})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
