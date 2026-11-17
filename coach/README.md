# Pahlavan: a fitness coach in Claude Code

Pahlavan's coach plans your strength training from your own goals, time and equipment, logs your workouts and meals, runs a Sunday check-in that ends with a short letter, and reviews each 4-week block with you. Every number comes from a small engine that ships with it, so the coach quotes a calculation instead of guessing.

## Install

```
/plugin marketplace add saeed1262/pahlavan
/plugin install pahlavan@pahlavan
```

Then make a folder for your training (it will hold your plan and your history), open it in Claude Code, and type `/fitness-coach intake`. It needs [Node.js](https://nodejs.org) 18 or later. The step-by-step start: https://github.com/saeed1262/pahlavan/blob/main/docs/without-obsidian.md

## What it runs, and where your data goes

- **One local script:** `skills/fitness-coach/scripts/engine.cjs`, a Node.js program with no dependencies, built from the TypeScript in the repository's `src/` (bundled, not minified). It reads and writes JSON and Markdown files in the folder you opened Claude Code in, and nowhere else. It makes no network requests.
- **Every write is shown to you first** and made only after your yes.
- **Nothing is sent to Pahlavan's author.** Claude Code sends your messages, and the files the coach reads, to Anthropic under your own account, as in any Claude Code session. The privacy policy: https://github.com/saeed1262/pahlavan/blob/main/docs/privacy.md

## Good to know

Pahlavan is a general fitness tool for adults 18 and over, not medical advice. It asks about red flags before anything else and sends you to a clinician when one comes up. If you have a health condition, check with a doctor before you start, and stop any exercise that hurts.

The optional Obsidian plugin adds screens, charts and reminders over the same files. The source, the full guide and the license (Elastic License 2.0): https://github.com/saeed1262/pahlavan
