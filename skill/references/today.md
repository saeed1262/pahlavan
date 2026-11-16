# today: the day in chat

The daily touchpoint: today's session, what's due, and the morning
check-in, in one message. It is how the day starts in a folder without
Pahlavan (no Today screen and no reminder cards: SKILL.md, "Without
Pahlavan"), and it works the same with it. The user starts it with
`/fitness-coach today`; nothing here ever runs on its own.

## Steps

1. **The date and time** from `date '+%Y-%m-%d %H:%M'`, then the
   training-day rule (SKILL.md house rule 17). Every command below and both
   writes take that date.
2. **Read, one command per call** (house rule 22):
   - `session --vault . --json --date D`: today's session from the plan's
     rotation, each item with its sets, rep range, RIR, target and last
     time, the adjustments with their reasons, the finisher
     (`numbers.md`, "`readiness`, `next`, `validate`").
   - `readiness --vault . --json --date D`: this morning's score when it is
     answered, and the actions (trim, early light week, no hard training).
   - `track day --vault . --json --date D`: the items due and still `open`,
     and `morning.value.done` (whether the morning check-in is answered).
   - `due --vault . --json --date D --time HH:MM`: the rest of the day's
     list (`today.value`: the body record when the tape, photos or tests are
     due, and the coach step, such as the Sunday check-in).
3. **One message, short:**
   - the session: each item on one line (name, sets × reps, the target,
     rest), the finisher, and any adjustment with its reason quoted from the
     engine; on a day the plan has no lifting, the short session it gives
     instead;
   - what's due: the open items by name, the body record when it is due,
     the coach step ("tonight: `/fitness-coach checkin`");
   - with meals recorded today (`meal show --date D`), one line: the meals so
     far and their protein, said as estimates ("2 meals, about 70 g of
     protein"); meals themselves go in with `/fitness-coach meal`;
   - with meals waiting from Pahlavan's form (`meal pending`), one line with
     how many and an offer to estimate them now (`meal.md`, section 0);
   - when `morning.value.done` is false, the morning questions in plain text, on
     one line (house rule 15): energy 1 to 5, soreness 1 to 5, hours slept
     and sleep quality 1 to 5, the weight in kg if they weighed in, and
     whether they're ill today.
4. **The answers, then one proposal:**
   - the morning: `{date, morning: {energy, soreness, sleepH, sleepQ,
     weight, illness}}`, only the fields the user gave, through `body
     --vault . --json --file <record.json>` (a dry run first; `numbers.md`,
     "The write path: `body`"). `illness` comes only from the user's own
     answer: `true` writes it, and readiness stops hard training that day
     (house rule 9); it is never inferred from tiredness or soreness;
   - the items the user says are done: `track tick --vault . --json --id
     <ids> --date D` (a dry run first; `--amount N` for water). Stand-ups,
     sitting time and desk breaks are counted by Pahlavan and can't be
     ticked;
   - both dry runs shown in one line each, then `--write` on both after the
     one yes. A `conflict` (a field the file already holds with another
     value) is asked about, never written over without the user's yes
     (`--replace`).
5. **When the morning changes the session:** run `readiness` and `session`
   again with the same date and say what changed and why, quoting the
   action's note ("one set fewer and RIR +1: energy 2, soreness 4").

## Rules

- **Numbers come from the engine** (house rule 1): every target, set and
  score is quoted from the commands above, never from memory. Meal numbers
  are the coach's estimates (the rule's one exception, `meal.md`): quote
  `meal show`'s totals with "about".
- **It never logs the session.** After training: `/fitness-coach log`
  (`log.md`).
- **Another session, a short day, travel, pain:** `plan`, an ad hoc change
  (`adhoc.md`); a red flag stops everything (house rule 7).
- **A gap is unlogged, not missed** (house rule 4): yesterday with nothing
  logged is a question, never a reproach.

**Done when:** the user has today's session (or the short day) and what's
due in one message; the morning answers and the items done went in after
the yes, each read back (`written: true`); nothing else was written.
