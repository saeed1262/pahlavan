// npm run pack-plugin
// The coach as a Claude Code plugin, in coach/: .claude-plugin/plugin.json,
// the skill as ship-skill installs it (skills/fitness-coach/: the text, the
// self-check and the built engine), a README (the directory's listing
// text), the LICENSE and the listing icon. The repository's
// .claude-plugin/marketplace.json lists it, so `/plugin marketplace add
// saeed1262/pahlavan` then `/plugin install pahlavan@pahlavan` installs it.
//
// coach/ is committed: a plugin installs from git, and only its own folder is
// copied. Run this after any change to skill/, the engine or the version;
// test/pack-plugin.test.ts fails while coach/ is behind. Nothing here uploads.

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.length > 2) {
  console.error('usage: npm run pack-plugin   (rebuilds coach/)');
  process.exit(2);
}
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const REPO = 'https://github.com/saeed1262/pahlavan';

/** The plugin's manifest. The directory reads the URLs for its listing; Claude Code ignores them. */
const PLUGIN = {
  name: 'pahlavan',
  displayName: 'Pahlavan - Fitness Workout and Health Coach',
  version,
  description: 'A science-based fitness coach in Claude Code: it plans your strength training from your own goals, time and equipment, logs your workouts and meals, and reviews each week with you. Your data stays in plain files on your computer.',
  author: { name: 'Saeed Ghorbani', url: 'https://github.com/saeed1262' },
  homepage: REPO,
  repository: REPO,
  license: 'Elastic-2.0',
  keywords: ['fitness', 'workout', 'strength-training', 'coach', 'nutrition', 'habits', 'health'],
  documentationUrl: `${REPO}/blob/main/docs/without-obsidian.md`,
  supportUrl: `${REPO}/issues`,
  privacyPolicyUrl: `${REPO}/blob/main/docs/privacy.md`,
  icon: './icon.png',
};

/** The plugin's README: what it is, the install, and everything it runs and sends. */
const README = `# Pahlavan: a fitness coach in Claude Code

Pahlavan's coach plans your strength training from your own goals, time and equipment, logs your workouts and meals, runs a Sunday check-in that ends with a short letter, and reviews each 4-week block with you. Every number comes from a small engine that ships with it, so the coach quotes a calculation instead of guessing.

## Install

\`\`\`
/plugin marketplace add saeed1262/pahlavan
/plugin install pahlavan@pahlavan
\`\`\`

Then make a folder for your training (it will hold your plan and your history), open it in Claude Code, and type \`/fitness-coach intake\`. It needs [Node.js](https://nodejs.org) 18 or later. The step-by-step start: ${PLUGIN.documentationUrl}

## What it runs, and where your data goes

- **One local script:** \`skills/fitness-coach/scripts/engine.cjs\`, a Node.js program with no dependencies, built from the TypeScript in the repository's \`src/\` (bundled, not minified). It reads and writes JSON and Markdown files in the folder you opened Claude Code in, and nowhere else. It makes no network requests.
- **Every write is shown to you first** and made only after your yes.
- **Nothing is sent to Pahlavan's author.** Claude Code sends your messages, and the files the coach reads, to Anthropic under your own account, as in any Claude Code session. The privacy policy: ${PLUGIN.privacyPolicyUrl}

## Good to know

Pahlavan is a general fitness tool for adults 18 and over, not medical advice. It asks about red flags before anything else and sends you to a clinician when one comes up. If you have a health condition, check with a doctor before you start, and stop any exercise that hurts.

The optional Obsidian plugin adds screens, charts and reminders over the same files. The source, the full guide and the license (Elastic License 2.0): ${REPO}
`;

const coach = join(root, 'coach');
const tmp = mkdtempSync(join(tmpdir(), 'pahlavan-plugin-'));
try {
  // ship-skill installs into a skill folder inside .claude/skills/; its self-check needs a vault, which this isn't.
  const staged = join(tmp, '.claude', 'skills', 'fitness-coach');
  mkdirSync(join(tmp, '.claude', 'skills'), { recursive: true });
  const ship = spawnSync(process.execPath, [join(root, 'tools', 'ship-skill.mjs'), staged, '--no-check'], { cwd: root, stdio: 'inherit', env: { ...process.env, INIT_CWD: root } });
  if (ship.status !== 0) process.exit(ship.status ?? 1);

  rmSync(coach, { recursive: true, force: true });
  mkdirSync(join(coach, '.claude-plugin'), { recursive: true });
  cpSync(staged, join(coach, 'skills', 'fitness-coach'), { recursive: true });
  writeFileSync(join(coach, '.claude-plugin', 'plugin.json'), `${JSON.stringify(PLUGIN, null, 2)}\n`);
  writeFileSync(join(coach, 'README.md'), README);
  copyFileSync(join(root, 'LICENSE'), join(coach, 'LICENSE'));
  // The directory's listing icon (a square PNG); it takes the first one it sees and never changes it. Outside
  // .claude-plugin/, since GitHub's web upload refuses hidden folders and an image can't be pasted in.
  copyFileSync(join(root, 'docs', 'images', 'brand', 'logo-512.png'), join(coach, 'icon.png'));
  console.log(`pack-plugin: coach/ rebuilt (pahlavan ${version})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
