# UX review (2026-10-30)

First review with the new tools: axe (WCAG 2.2 AA, automated, both themes) and a cognitive walkthrough with
Nielsen's heuristics (`cognitive-walkthrough` and `nielsen-heuristics-audit` skills, from
[mastepanoski/claude-skills](https://github.com/mastepanoski/claude-skills)). It is an expert inspection at a
360 px phone width, not a test with real people.

**Persona:** a first-time user, teen or young adult, goes to the gym and knows the basic lifts, has not met RIR or
RPE before, uses the app on a phone between sets.

**Tasks walked through:** (1) first launch to logging the first food; (2) logging a workout with how hard it was;
(3) changing today's workout.

**Likely to succeed first time:** task 1 *possible* (it completes, but often with the wrong food); tasks 2 and 3
*likely*.

## Accessibility (axe, automated)

Every main screen and sheet was scanned in light and dark themes (`e2e/a11y.spec.ts`). Four colour-contrast
failures were found and fixed:

| Where | Problem | Fix |
|---|---|---|
| Rank badges | White text on light tier colours (Gold 2.2:1, Silver 2.5:1 ...) | Dark text on the light tiers; Wood, Champion and Titan deepened slightly for white text (all 4.6:1 or more) |
| A done quest's bar | Grey text on the green bar | White text |
| Week sheet, "Not due" / "Rest" | Faint grey on the highlighted row (4.4:1) | The darker grey (5.9:1) |

Automated checks find roughly a third of accessibility problems; keyboard and screen-reader passes are still to do.

## Findings, most severe first

Severity: 4 catastrophic, 3 major, 2 minor, 1 cosmetic.

### 1. Searching "banana" puts banana powder first; the plain banana is not on the first screen (3)
*Task 1, step "pick the food". Heuristics: match with the real world (H2), error prevention (H5).*
The top hit is "Bananas, dehydrated, or banana powder" at 346 kcal/100 g, followed by banana melon, banana
pepper, banana chips and pudding mixes. "Bananas, raw" (89 kcal) is further down. A new user taps the first result
and logs about four times the calories. Cause: the search gives a bonus to whole-word matches, and "bananas" is
not a whole-word match for "banana", while "banana powder" is.
**Fix:** count a plural (`banana` → `bananas`, `egg` → `eggs`) as a whole word, so the shortest plain name
wins; add a unit test for "banana", "egg", "apple".

### 2. RIR and RPE are not explained anywhere (3)
*Task 2, steps "read the aim" and "say how hard it was". Heuristics: match with the real world (H2), help (H10).*
"Aim for RPE 8.5 · RIR 1-2" and a list of 14 rows like "RPE 6-7 · RIR 3-4 · Challenging" assume the user knows
the terms. The chart's words ("Hard effort", "Challenging") help, but they come last and are cut off on a phone.
**Fix:** one plain line in the aim box, "RIR: reps you could still have done. RPE: effort out of 10.", and a
"What's this?" link that opens the chart as a table. Optionally start each option with the plain reading
("2 reps left · RPE 8 · Hard effort").

### 3. The default goal is "Lose weight" (2)
*Task 1, the welcome form. Heuristic: error prevention (H5).*
Someone who skims the form starts with a calorie target up to 20% under maintenance without having chosen it.
**Fix:** no goal selected until one is picked ("Pick a goal"), or default to "Maintain weight".

### 4. Two portion sizes can show as selected at once (1)
*Task 1, the portion sheet.* Banana powder's "1 cup" is 100 g in the USDA data, so "1 cup" and "100 g" both light
up. **Fix:** highlight only the first matching size.

### 5. "About 0 kcal" next to "No workouts logged today" (1)
*Food tab, calories burned card.* It says the same thing twice. **Fix:** hide the total when there are no workouts.

### 6. The split's start button wraps to three lines (1)
*Task 3.* "Start shoulders & arms" beside "Change" breaks into three short lines at 360 px. **Fix:** "Start" (the
day's name is the heading right above it), keeping the full name for screen readers.

## Fixed (2026-10-31)

All six findings are fixed and covered by tests:

1. **Search.** A singular or plural counts as a whole word, and a short list of everyday foods
   (`src/core/everyday.ts`, 44 searches) puts the plain form first. The probe that found more cases: "eggs"
   gave dried egg, "rice" rice crackers, "milk" dried buttermilk, "potato" potato flour. Now "banana", "eggs",
   "rice", "milk", "potatoes", "oatmeal" and "chicken breast" each give the everyday food first (unit tests
   against the real food list, and a browser test).
2. **RIR and RPE.** The workout form says what each means in one line, with "Show the chart" opening the
   owner's chart as a table (RPE, RIR, what it feels like). The table is in the accessibility scan.
3. **Default goal.** New players start at "Stay where I am" (maintenance).
4. **Portion sizes.** Only one size lights up: the one tapped, else the first that matches.
5. **Calories burned.** No total is shown until a workout is logged.
6. **Start button.** It reads "Start"; screen readers still hear "Start chest & back". The program card does
   the same.

## What works well

- Every log ends in a short message with **Undo** (user control, H3), and a rank-up is called out right away.
- The aim box and the picker's "(next in the split)" / "Picked" make the state visible (H1).
- The week sheet's "Do it today" names the action and the result; the calendar updates at once.
- Tab bar labels and icons are clear; nothing needs a login.

## Not covered

Keyboard-only and screen-reader passes (VoiceOver, TalkBack), real users, the Friends tab signed in, barcode
scanning, and iPhone Safari.
