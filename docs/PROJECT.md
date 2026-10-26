# Fitness Quest - project brief

## What it is

A personal fitness app for one user (the owner), used every day on an Android phone. It tracks calories with as
little effort as possible, wraps training in a pixel-art adventure game (quests, XP, levels, streaks), turns the
owner's own workout notes into custom quests, and builds a simple training program from a chosen goal (weight
loss, weight gain, muscle gain, cardio, marathon prep, and similar).

**Done looks like:** the owner logs a meal in a few seconds (scan or one tap), logs a workout, sees quests complete
and the character progress, and keeps using it daily because it is fun and not a chore.

## Answers from kickoff (2026-10-26)

| Question | Answer |
|---|---|
| Where it runs | Android phone (installed web app / PWA, Chrome) |
| Existing workouts | Plain-text notes |
| Calorie logging | Barcode scan + one-tap favourites and recents |
| Game layer | Pixel-art adventure: a sprite on a map that moves as quests are completed |

## Defaults assumed (change any of them by saying so)

- **Folder:** `C:\Users\super\fitness-quest`.
- **Free services only.** No paid APIs, no paid hosting. Photo-based calorie estimates are out of scope.
- **Data stays on the phone** (browser storage), with an export/import backup file. No accounts, no server, no
  cloud sync.
- **Repo and hosting:** a public GitHub repo with GitHub Pages (owner's choice, 2026-10-26): free, with the HTTPS the
  camera and the install prompt need. The site is reachable by URL but useless to anyone else: data is local to
  each browser, and nothing personal goes in the repo.
- **Units:** metric (kg, km, kcal) with a setting for imperial later if wanted.
- **One user**, English UI, no social features, no ads.
- **Not a medical tool:** calorie and program targets come from standard published formulas and templates, shown
  with that caveat.

## Things the owner can describe later

- A sample of the workout notes (a few real entries), so the import parser fits them.
- Body stats for targets (height, weight, age, sex, activity level) - entered in the app, never committed.
- Favourite foods and usual meals, to seed the favourites list.
