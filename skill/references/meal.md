# Meal: a meal estimated from a photo or a description

The user sends a photo of a meal, or says what they ate ("chicken and rice,
a palm of chicken, a cupped hand of rice"). The coach names each food and
its portion, estimates the meal's protein, calories, fiber, fat and carbs
itself, shows it with the day so far, and records it after the yes with
`engine meal add`. The day's Protein item ticks when the day's estimated
protein reaches its goal. Meals the user saved in Pahlavan's meal form
wait for this job too (section 0).

## 0. Meals waiting from Pahlavan's form

Pahlavan's **Log a meal** form (and its Food tab's button) saves a meal as
waiting: the user's own words and a photo, in `Coach/Inbox/meals/`, never a
number, since Pahlavan estimates nothing. Start every meal job with `meal
pending` (`numbers.md`, "The write path: `meal`"); with none waiting, go on
to section 1.

1. **Each waiting meal:** read its photo with the Read tool at the path
   `meal pending` gives (`photo`), and take its `text` as the user's own
   words (what they say wins, section 2). `photoFound: false` (the photo
   stays out of git, so it may be on the other Mac): estimate from the
   words, and say the photo wasn't there. Its `date` and `at` are the
   form's; keep them unless the user corrects them.
2. **Estimate each** as sections 1 to 4 do, with at most one question for
   the whole batch (the one that moves the numbers most).
3. **Propose them all in one message**, each as section 5 shows a meal, then
   the day so far for each day they fall on, and one question: "Save them?"
4. **On the yes,** one `meal add --file <meal.json> --pending <id> --write`
   each: the meal is recorded, and its waiting file and photo are removed.
   One line with what was written.
5. **One the user doesn't want recorded** (a duplicate, a mistake): `meal
   discard --pending <id> --write` after their yes. `strays` (a photo left
   from a removal that stopped half way): `meal discard --pending <the
   stray's id> --write` clears it; say so in one line.

A photo from the form is the one photo the vault keeps for a while: until
the estimate, then the engine removes it. Never copy it, move it or name it
anywhere else.

**These numbers are the coach's own** (SKILL.md house rule 1's one named
exception). No food table checks them: the coach reads the photo or the
words and estimates. So every number is said with "about", recorded with
`by: coach` and a confidence, and never treated as measured. The engine
does what code should: it checks the record, keeps the file, adds up each
day (quote its `day` totals, never a sum of your own) and ticks Protein.

**How good the estimates are** (the evidence behind this job): from a photo,
protein comes close on average and calories can be off by a third or more,
mostly from oil, butter and sauces the photo doesn't show. A portion or a
label from the user helps most. So ask at most one question, and only
where it changes the numbers.

## 1. Before the first meal: counting

- **Read the eating plan's `counting`** (`engine food`, or
  `Coach/eating-plan.json`). `"none"` means the eating-history screen ruled
  counting out: record protein only, say it in palms, and show no calories,
  fat, carbs or fiber (the engine refuses them: `counting-none`).
- **No eating plan yet:** before the first meal of a conversation, ask
  `diet.md`'s eating-history question (section 1, question 1). Any answer
  but No: protein only, in palms, with the referral line from `diet.md`.
  Only an eating plan keeps the answer (its `counting`), so until there is
  one the question comes once a conversation; offer `/fitness-coach diet`
  to keep it.
- **Under 18:** not coached on food (`diet.md`): no meal job.
- **Counting allowed, at any level:** all five numbers. Asking to log a
  meal is the user's own choice, so it is no push to a higher level (house
  rule 10). At the Light level, lead with protein in palms and grams, then
  the rest in one line.

## 2. The foods and their portions

- **From a photo:** read it in the chat (the Read tool, or the image the
  user attached). **Never save it**, copy it or name a path for it: the
  photo is used for this estimate only. (A photo from Pahlavan's form
  already waits in the vault: section 0.)
- **Name each food** and its portion in grams and in hand portions (a palm
  of protein, a fist of vegetables, a cupped hand of carbs, a thumb of fat:
  `diet.md`, section 6). Plates and bowls of a known size, a fork beside the
  food, a packaged label: use them.
- **What the user says wins:** a weight they give, a label's numbers, "no
  oil", "two eggs, not three".

## 3. One question at most

Only when the answer would move the numbers a lot, and only one:
- the cooking fat or a sauce the photo doesn't show ("Was it cooked in oil
  or butter, and about how much?");
- a portion the photo can't size ("About how much rice: one cupped hand or
  two?");
- what a dish is, when it isn't clear.

No question when the estimate is good enough as it is. Without an answer,
assume the usual (about a teaspoon of oil for a pan-cooked portion) and say
so in the `note`.

## 4. The estimate

For each food, then the meal: protein (g), calories (kcal), fiber (g), fat
(g) and carbs (g), each a whole number (protein to the nearest gram). Then a
confidence:
- **high:** weights or a label given;
- **medium:** a clear photo or a clear description with portions;
- **low:** hidden fat or sauce, a mixed dish, a portion guessed.

Write the meal file (`formats.md`, "`meals.json`"): `date` (the training
day, house rule 17: between 00:00 and about 04:00 it is the day before
unless the user says otherwise), `at` when the user said when or it is the
chat's time, a short `name` ("Lunch: chicken, rice and salad"), `items`,
`estimate`, `confidence`, `from` (`photo` or `text`), and a `note` naming
what it assumed. Leave out `id` and `by`: the engine fills them.

## 5. The proposal

Run `meal add --file <meal.json>` (a dry run) and show, in one message:
- one line per food with its portion;
- the meal: "about 48 g protein, about 620 kcal, 4 g fiber, 18 g fat, 60 g
  carbs" (at Light: "about 2 palms of protein, 48 g", then the rest);
- what it assumed (the `note`), when the confidence isn't high;
- the day so far from the dry run's `day` (its `partial` named: "calories
  from 2 of the 3 meals");
- Protein: `protein.tick` `added` ("this brings today to about 140 g:
  Protein ticks"), `short` ("about 48 g of your 134 g so far"), `already`
  (ticked before), `no-item` (no Protein item: say nothing, or offer the
  `habits` job once).

Then one question: "Save it?" On the yes, `meal add --file <meal.json>
--write`, and one line with what was written.

## 6. Corrections and more

- **A correction** ("it was two eggs, not three"): `meal show --date D` for
  its id, `meal delete --id <id>` and a new `meal add`, both after one yes.
  When the day no longer reaches the goal, the tick stays: offer `track tick
  --id <protein id> --date D --done false`.
- **The day or the week:** `meal show --date D`, or `--from D --to D`; quote
  its totals with "about".
- **Several meals at once** (a day's worth): one `meal add` each, after one
  yes for all of them.

## Wording

- Food is never good or bad, and an amount is never "too much": say what it
  holds, and what the day still has room for against the eating plan when
  there is one ("about 50 g of protein to go today").
- No meal skipping, fasting or compensating ("eat less tomorrow"): `diet.md`
  keeps food to general wellness.
- A number is never said as exact: "about", always, and the confidence when
  it is low.
- In a letter or a check-in, meal numbers are quoted as estimates, and they
  never drive a plan change, an energy target or a rate band as if measured.
