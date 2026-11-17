# Pahlavan without Obsidian: a step-by-step start

Pahlavan's coach works on its own in Claude Code, in a plain folder on your computer. You don't need Obsidian or the plugin. This page takes you from nothing installed to your first week of training, one step at a time. If you already use Obsidian, the [user guide](user-guide.md) is the better start: the plugin adds screens on top of the same coach.

## What you get, and what you don't

**You get the whole coach, in chat:**

- the intake and its safety screen;
- a plan built for you, with its reasons;
- each day's session with its targets;
- logging;
- a morning check-in;
- the Sunday check-in and your coach's letter;
- the reviews every four weeks and at each phase's end;
- an eating plan, meals estimated from a photo or a description, and a few daily habits.

Every number comes from the same engine the plugin uses, and your records are the same files.

**You don't get** the screens, the charts or the reminder cards, so nothing pops up to remind you: you start each step yourself, with its command. Stand-ups and sitting time aren't tracked either, since Pahlavan counts them from your keyboard and mouse.

## What you need

- **A Claude plan that includes Claude Code** (a paid plan). Claude Code sends your messages, and the files the coach reads, to Anthropic under your own account.
- **Claude Code itself:** the Claude desktop app's Code tab, or Claude Code in a terminal. Step 2 covers both.
- **[Node.js](https://nodejs.org) 18 or later.** The coach's engine runs on it.
- **Python 3, only if you track water:** the coach works out a water target with a short Python script. A Mac has Python once its command line tools are installed.
- **About 15 minutes to set up.** The intake that follows is a conversation, and goes at your pace.

Pahlavan is built and tested on macOS. The coach is plain Node.js and text files, so it should work elsewhere, but only the Mac has been tried.

## 1. Install Node.js

Download the LTS installer from [nodejs.org](https://nodejs.org) and run it. To check it worked, open Terminal (in Applications, Utilities) and type:

```
node --version
```

You should see `v18` or a higher number. If Terminal says it can't find `node`, close Terminal, open it again, and try once more.

## 2. Install Claude Code

Choose one way:

- **The Claude desktop app** (easiest if you've never used a terminal). Install the app, sign in, and open its **Code** tab. Anthropic's [desktop quickstart](https://code.claude.com/docs/en/desktop-quickstart) walks through it.
- **Claude Code in a terminal.** Follow Anthropic's [quickstart](https://code.claude.com/docs/en/quickstart). Its [terminal guide for new users](https://code.claude.com/docs/en/terminal-guide) explains the few commands you need.

Either way, Claude Code asks you to sign in with your Claude account the first time.

## 3. Get the coach

Choose one way.

**A. As a Claude Code plugin** (two commands, and Claude Code updates it for you). In a terminal, type:

```
claude plugin marketplace add saeed1262/pahlavan
claude plugin install pahlavan@pahlavan
```

Inside Claude Code you can type the same as `/plugin marketplace add saeed1262/pahlavan`, then `/plugin install pahlavan@pahlavan`, and install it for yourself. The coach is then there in every folder you open in Claude Code. Make a folder for your training, such as `Pahlavan` in your Documents folder: it holds your plan and your training history from now on, so keep it in your backups.

**B. From the zip:**

1. Open the [latest release](https://github.com/saeed1262/pahlavan/releases/latest) and download `pahlavan-coach-<version>.zip` from its files.
2. Double-click the zip (on Windows: right-click, **Extract All**). You get a folder named `Pahlavan`.
3. **Move the folder somewhere it will stay,** such as your Documents folder, not Downloads. It holds your plan and your training history from now on, so keep it in your backups. You can rename it.

Inside are a `START HERE.md` and a hidden `.claude` folder that holds the coach. On a Mac, Finder hides folders whose names start with a dot; press **Cmd+Shift+.** to show them.

## 4. Open the folder in Claude Code

- **In the desktop app:** in the Code tab, choose the folder to work in, and pick your `Pahlavan` folder.
- **In a terminal:** go into the folder and start Claude Code. For a folder in Documents, type:

  ```
  cd ~/Documents/Pahlavan
  claude
  ```

The first time, Claude Code asks whether you trust the folder: say yes. Type `/fitness-coach` and you should see the coach offered as you type. If it isn't, Claude Code was opened somewhere else: check that you chose the `Pahlavan` folder itself, not the folder around it.

**Permission prompts.** Claude Code asks before it runs a command or writes a file. The coach's commands start with `node` and the path of its engine (ending `fitness-coach/scripts/engine.cjs`), and they read and write only inside this folder. You can allow each one as it comes, or allow them for this folder so the coach asks less.

## 5. Your intake

Type:

```
/fitness-coach intake
```

The coach asks in short rounds, like a first meeting with a coach. It covers:

- a short safety screen;
- your goals and your week;
- your equipment and the weights your gym has;
- injuries;
- what you enjoy and what you'd rather never do.

Answer in plain words; "I don't know" is fine. If an answer needs a doctor's view, the coach stops and says so.

Then comes the body assessment:

- **Photos (optional).** The coach says how to take them, and where to drop them: a dated folder under `Fitness/Progress Photos/` inside your `Pahlavan` folder. You can say no, and the coach relies on the movement self-check instead.
- **The movement self-check:** a few simple tests, such as a wall test and a plank, whose results set your starting levels.

From all of it, the coach decides which muscles to give priority, with its reasons, and asks you to confirm.

Nothing is written until you say yes. Then the coach writes your profile, your record of injuries and limits, and your starting measurements, and offers to design your plan.

## 6. Your plan

Type:

```
/fitness-coach plan
```

The coach first asks the few questions it still needs (one message, then it waits for your answers). Then it designs at least three options and picks one for you. It shows the plan with "How your data shaped this plan": every choice tied to something you told it, or to the evidence with its grade. Say yes, and it writes the plan. Ask why any exercise is there; each one carries its reason.

## Your week

Nothing reminds you, so here is when to talk to the coach. Each line is what you type:

| When | Type | What happens |
|---|---|---|
| Every morning | `/fitness-coach today` | Today's session with its targets, what's due, and a short morning check-in (energy, soreness, sleep, an optional weight, whether you're ill) |
| After training | `/fitness-coach log` | Say what you did in plain words, for example "did A, squat 60 x 8, bench 40 x 10". The coach shows the entry and saves it after your yes |
| Sundays | `/fitness-coach checkin` | The week's review, a few questions, next week's targets and your coach's letter. Every fourth week it's the longer review |
| After a meal, if you like | `/fitness-coach meal` | Send a photo or say what you ate. The coach estimates its protein, calories, fiber, fat and carbs, shows your day so far, and saves it after your yes (the photo itself isn't kept) |

And any time, in plain words:

- **Plan changes:** "I'm travelling next week", "my knee hurts on lunges", "I only have 30 minutes today", "can I do D instead?".
- **Corrections:** "change Tuesday's squat to 62.5 x 8", "delete yesterday's session".
- **Food and habits:** "make me an eating plan", "what did I eat today?", "track creatine", "pause water for a week".
- **Questions:** "am I on pace for my goal?", "how is my bench going?".

The coach answers every number from the engine and names where it came from.

## Every job

Each job has its command; plain words work too, and the coach picks the job from them.

| Type | For |
|---|---|
| `/fitness-coach intake` | The first time, or a fresh start |
| `/fitness-coach plan` | Your plan, and any change to it: travel, soreness, a short day, an injury, missed weeks, the next month. `/fitness-coach plan why` gives the plan's reasons |
| `/fitness-coach today` | The morning: today's session, what's due, a short check-in |
| `/fitness-coach log` | A session, a ladder level, a fixed top set, or a logged session changed or deleted |
| `/fitness-coach checkin` | Sundays: the week's review, a few questions and your letter. Mid-week: next week's targets |
| `/fitness-coach review` | The check-in that ends a light week (every fourth), and each phase's end |
| `/fitness-coach progress` | New photos in `Fitness/Progress Photos/`, or a dated progress report |
| `/fitness-coach diet` | An eating plan, and questions about protein |
| `/fitness-coach meal` | A meal from a photo or your words |
| `/fitness-coach habits` | Daily items such as creatine or water: add, change, pause or stop one. Stand-ups and sitting time need Pahlavan |
| `/fitness-coach ask` | Questions about your own data: "am I on pace?", "how is my bench going?" |

The [user guide's table](user-guide.md#the-coach-and-its-jobs) has more examples of what to say. Some of its jobs mention Pahlavan's screens: without them, the coach asks in chat instead.

## Where your files are

Everything stays in your `Pahlavan` folder:

```
Pahlavan/
  START HERE.md
  .claude/skills/fitness-coach/   the coach, from the zip (with the plugin, Claude Code keeps it)
  Fitness/
    plan-data.json                your plan
    fitness-log-data.json         your training log
    body-data.json                weight, waist, sleep, the morning answers
    Progress Photos/              your photos, by date
    Coach/
      Athlete profile.md          what the coach knows about you
      Ledger.md                   injuries and the limits they set
      Letters/                    your Sunday letters
      Decisions.md                every plan change, with its reason
      meals.json                  the meals you logged, as the coach estimated them
```

The `.md` files are plain text you can read in any editor. Don't edit the `.json` files by hand: the coach writes them through its engine so they stay valid.

## Update the coach

- **The plugin:** type `claude plugin update pahlavan@pahlavan` in a terminal, then start Claude Code again. To have it done for you, turn on auto-update for the `pahlavan` marketplace in `/plugin`, under Marketplaces.
- **The zip:** when a new version comes out, download its `pahlavan-coach-<version>.zip`, and replace your folder's `.claude/skills/fitness-coach` with the one inside it.

Either way, your `Fitness` folder stays exactly as it is.

## Add the screens later

The folder is already an Obsidian vault in waiting. Install [Obsidian](https://obsidian.md), open your `Pahlavan` folder as a vault, and install Pahlavan from **Settings, Community plugins, Browse**. The plugin reads the same files, so your plan, log and letters appear on its screens. If you installed the coach as a Claude Code plugin, you can skip Pahlavan's **Set up the coach** button, which puts a second copy in the folder. The [user guide](user-guide.md) takes it from there.

## If something goes wrong

- **`node` or `claude` isn't found.** Close the terminal and open a new one. For Claude Code, Anthropic's [troubleshooting page](https://code.claude.com/docs/en/troubleshoot-install) covers the usual causes.
- **`/fitness-coach` isn't offered.** With the plugin: `claude plugin list` should show `pahlavan`; start Claude Code again after installing it. With the zip: Claude Code isn't open in the `Pahlavan` folder itself (step 4).
- **The coach says a file doesn't pass its check.** Tell it what you changed last; it can show the problem and fix it through the engine.
- **Anything else:** [open an issue](https://github.com/saeed1262/pahlavan/issues) with what you typed and what you saw. Leave out anything personal.

Pahlavan is a general fitness tool for adults 18 and over, not medical advice. If you have a health condition, check with a doctor before you start, and stop any exercise that hurts.
