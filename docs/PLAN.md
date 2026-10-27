# Plan - Fitness Quest

Status: **approved by the owner on 2026-10-26** (public repo + GitHub Pages). Brief: [PROJECT.md](PROJECT.md). Evidence:
[RESEARCH.md](RESEARCH.md). Decisions and reasons: [DECISIONS.md](DECISIONS.md).

## Architecture

- **A static PWA** (Vite 8 + React 19 + TypeScript), installed on the Android home screen, hosted free on
  GitHub Pages. No server and no accounts. Works offline except barcode lookups.
- **All data on the phone** in IndexedDB (Dexie), plus a backup file to export and import.
- **Records are the truth; the game is derived.** Food entries, workouts and weigh-ins are stored as records.
  XP, level, streaks, quest progress and the map position are computed from them by pure functions in
  `src/core/`. Rule changes recompute cleanly, bugs can't corrupt saved progress, and every rule is unit-testable.
- **`src/core/` has no DOM and no React**: targets, food search, Open Food Facts mapping, notes parser, quest
  engine, program generator. This is where Qwen works, against tests written by Claude. `src/ui/` is Claude's.
- **Food data:** recents/favourites/saved meals (one tap) → offline USDA list bundled with the app (search) →
  Open Food Facts by barcode (cached) → manual label entry → quick-add kcal.
- **Game:** a 16×16 pixel-art overworld (Kenney Tiny Town/Dungeon + Tiny Creatures, all CC0) drawn by a small
  Canvas 2D renderer. Each completed quest moves the hero one step along the path; new regions open with levels;
  "boss" quests are PR attempts and milestones. GSAP drives XP pops, level-ups and quest-complete moments.

## The contract (written first, task 0.2)

`src/contract.ts` holds the TypeScript types and matching zod schemas that both Claude and Qwen build against:

- `Food` - id, name, brand?, barcode?, source (`usda` | `off` | `custom`), per-100 g kcal/protein/carbs/fat,
  portions `[{label, grams}]`.
- `FoodEntry` - id, date (local `YYYY-MM-DD`), loggedAt, meal slot, foodId or none (quick-add), grams?, kcal and
  macros (copied at log time so later food edits don't rewrite history).
- `SavedMeal` - id, name, items `[{foodId, grams}]`.
- `Workout` - id, date, kind (`strength` | `run` | `cardio` | `other`), exercises
  `[{name, sets: [{reps?, weightKg?, durationS?, distanceM?, rpe?}]}]`, source (`manual` | `import` | `program`),
  programSessionId?, note?.
- `WeighIn` - date, kg. `Profile` - sex, birthYear, heightCm, activity level, goal, units.
- `Program` / `PlannedSession` - goal, start date, weeks → days → planned exercises or runs, progression state.
- `Quest` - id, kind (`daily` | `weekly` | `story` | `boss`), title, `QuestCondition` (a tagged union:
  `log_meals`, `kcal_in_range`, `workout_count`, `exercise_volume`, `beat_pr`, `run_distance`, `run_time`,
  `program_session`, `weigh_in`), xp, window (start/end), origin (`daily` | `history` | `program`).
- `GameState` (derived, never stored) - xp, level, streak, freezes, completed quests, map node.
- `Backup` - `{app: "fitness-quest", version, exportedAt, tables}`, validated on import.

## Milestones (thin slices, each usable on its own)

Owner rules come from `CLAUDE.md`. **Claude writes every test** before the task starts. Qwen tasks run at
`--effort high` unless marked otherwise; 🌙 = can go in the overnight queue (tests committed, no open design
questions). Strata is up (checked 2026-10-26, 64K context), so Qwen tasks can run one at a time during the day,
and batches of 🌙 tasks go to the overnight queue.

### M0 - Setup: an empty installable app on the phone
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 0.1 ✅ | Scaffold Vite/React/TS + vite-plugin-pwa, Vitest, Playwright, ESLint/Prettier, `.gitignore`, project `CLAUDE.md`, README | Claude | `npm test`, `npm run lint`, `npm run build` pass on the empty app | - |
| 0.2 ✅ | `src/contract.ts` types + zod schemas | Claude | type-checks; schema round-trip tests pass | 0.1 |
| 0.3 ✅ | **Public** GitHub repo + GitHub Pages deploy workflow | Claude (owner OKs creating the repo) | app installs from the Pages URL on the phone | 0.1 |

### M1 - Calories: log a day's food in seconds
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 1.1 ✅ | `core/targets.ts`: Mifflin-St Jeor, activity factors, goal deltas with safety caps | Qwen (medium) 🌙 | Claude's table tests pass (known values, caps, edge ages) | 0.2 |
| 1.2 ✅ | `scripts/build-foods.ts`: USDA Foundation + SR Legacy → compact `foods.json` | Qwen 🌙 | fixture-CSV test passes; real output < 1 MB gzipped (measured) | 0.2 |
| 1.3 ✅ | `core/foodSearch.ts`: offline ranked search (prefix, tokens, recents boost) | Qwen 🌙 | ranking tests pass; 10k-item search < 20 ms in a benchmark test | 1.2 |
| 1.4 ✅ | `db/`: Dexie schema + repositories for foods, entries, meals, profile | Qwen 🌙 | repository tests pass on fake-indexeddb | 0.2 |
| 1.5 ✅ | `core/diary.ts`: day totals, recents, favourites, saved-meal expansion | Qwen 🌙 | tests pass | 0.2 |
| 1.6 ✅ | UI: profile setup, home "speed log" screen, search sheet, portion picker, quick-add | Claude | E2E: repeat meal ≤ 2 taps, search-and-log ≤ 4 taps, at phone width | 1.1-1.5 |

### M2 - Barcode scanning
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 2.1 ✅ | `core/off.ts`: Open Food Facts client (fields filter, `X-User-Agent`, missing-nutrition handling, ≥ 4 s spacing, local cache) | Qwen 🌙 | tests with mocked fetch pass (found, not found, partial, 503) | 1.4 |
| 2.2 | Scanner screen: camera, native `BarcodeDetector`, lazy polyfill fallback | Claude | Playwright test with a fake camera image; **real phone scans 5 products** | 2.1 |
| 2.3 ✅ | Manual label entry → custom food (becomes a favourite) | Claude | E2E test | 2.2 |

### M3 - The game: quests, XP, the map
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 3.1 ✅ | Workout logging UI (recent exercises one tap, sets stepper, runs by distance/time) | Claude | E2E: log a 3-exercise workout | 1.4 |
| 3.2 ✅ | `core/game.ts`: XP per record, level curve, streak (log anything counts), freezes earned per 7 days, max 2 | Qwen 🌙 | Claude's tests incl. day boundaries, DST, gaps, freezes | 0.2 |
| 3.3 ✅ | `core/quests/evaluate.ts`: progress of every `QuestCondition` from records | Qwen 🌙 | one test group per condition type | 0.2 |
| 3.4 ✅ | `core/quests/daily.ts`: seeded daily/weekly quest picks from profile + recent behaviour | Qwen 🌙 | deterministic-seed tests; never asks for more than the user's range | 3.3 |
| 3.5 ✅ | Art direction: tiles, palette, pixel font, map layout (Tiled JSON), hero and monsters | Claude | a static mock screenshot the owner likes | - |
| 3.6 ✅ | Canvas map renderer + hero walking between nodes | Claude | 60 fps on the phone; screenshot check | 3.5 |
| 3.7 (part) ✅ | Quest log, XP bar, level-up and quest-complete moments (GSAP), reduced-motion path | Claude | E2E: log food → quest completes → hero moves | 3.2-3.6 |

Split on 2026-10-26 to spare the owner's usage: **M3a done** = 3.1-3.4 plus the quest log, XP bar, streak,
tabs and quest-complete / level-up toasts (CSS, no GSAP yet). **M3b left**: see below.

### M3b - The hero and the map (expanded 2026-10-26 with the owner's character ideas)
Changed 2026-10-26 (built): for now the hero uses Kenney's Mini Characters (CC0, `art/kenney/`): 12 modern characters
(casual, police, office, lab coat...), separate body and head meshes on a 7-bone rig, one shared colour texture,
32 animations (idle, walk, sprint, jump, emote yes/no, sit, interact), about 250 KB each. KayKit's fantasy set
(`art/kaykit/`, plus a sporty recolour test in `art/sporty.py`) stays available. Body shape comes from morph
targets added in Blender (`art/body_keys.py`: muscle, fat, thin), because uneven bone scaling skewed the rotated
arms; three.js blends them with morphTargetInfluences. Preview: `docs/hero-kenney-test.png`. Customisation is the choice of character for now (3.8, 3.11); mixing
heads and bodies, recolours and level-locked gear come later. The map (3.6) is the hero's own 3D world: an endless path of stops, one per completed quest
(`src/ui/hero/world.ts`, `heroScene.ts`). Left in M3b: 3.7 richer moments (GSAP).

| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 3.5 | Art mock: the 3D hero at 5 muscle levels, 5 builds and 5 looks (cap + track jacket, knight gear...) | Claude | the owner approves a screenshot | - |
| 3.8 ✅ | `contract.ts`: `Profile.avatar` (skin, hair, hair colour, outfit, outfit colour, headgear) + unlock list | Claude | schema tests | 3.5 |
| 3.9 ✅ | `core/body.ts`: muscle 0-4 and build -2..+2 from records (rules below) | Qwen | Claude's tests: ramps up, decays, partial-log days ignored, caps | 3.2 |
| 3.10 ✅ | 3D hero in the app: lazy-loaded viewer, idle animation, more hair, outfits and gear | Claude | screenshot grid; 60 fps on the phone | 3.5, 3.9 |
| 3.11 ✅ | Customise screen (first run and from Quests), level-locked items shown greyed with their level | Claude | E2E: change hair and outfit, it persists | 3.8, 3.10 |
| 3.6 | Map in the same rounded style + hero walking between nodes | Claude | 60 fps on the phone; screenshot check | 3.10 |
| 3.7 | GSAP moments: quest complete, level up, body change ("Looking stronger!"), reduced-motion path | Claude | E2E: log food -> quest completes -> hero moves | 3.6 |

Body rules (proposed, owner to confirm):
- **Muscle 0-4** from the last 28 days: points = workouts (max 1 a day) + completed quests / 2 + streak days / 7.
  Steps at 4, 10, 18, 28 points. It goes both ways: stop training and it fades over a few weeks.
- **Build -2..+2** from calorie balance over the last 14 days, counting only finished days (not today) with at
  least 2 food entries, so a day where only breakfast was logged never reads as starving. Average of
  (eaten - target) / target: above +10% is +1, above +25% is +2; below -15% is -1, below -30% is -2. Fewer than
  3 counted days: no change.
- Changes are gradual by design (2-4 week windows) and capped; under-eating shows as tired (pale, slumped), not
  as a reward. A setting turns body changes off.
- Gear unlocks by level (e.g. cap at 3, track jacket at 5, knight helmet and armour at 10, crown at 15), so levels give
  something to see.

### M4 - Import notes, quests from your own history
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 4.1 | Owner shares sample notes → anonymised test fixtures + expected JSON | Claude + owner | fixtures committed | - |
| 4.2 ✅ | `core/import/notesParser.ts`: notes → `Workout[]` + unparsed lines | Qwen 🌙 | every fixture parses to its expected JSON | 4.1 |
| 4.3 | `core/history.ts`: PRs, exercise frequency, typical weekly volume, run bests | Qwen 🌙 | tests pass | 0.2 |
| 4.4 ✅ | `core/quests/fromHistory.ts`: PR "boss" quests, consistency and volume quests (rules spec by Claude) | Qwen 🌙 | tests: sensible targets (e.g. +2.5 kg or +1 rep, never > +5%) | 4.3 |
| 4.5 ✅ | Import screen: paste or file, preview, fix unparsed lines | Claude | E2E with a fixture | 4.2 |
| 4.6 | *Optional:* `tools/import_notes.py` on the PC, sends leftover lines to Qwen via Strata | Qwen (medium) | test against a mocked Strata | 4.2 |

Done 2026-10-26 (owner away; notes format guessed until real samples arrive, task 4.1 still open):
notes import (`core/import/notesParser.ts`, written by Claude after Qwen ran out of room twice), strength ranks
like Liftoff (`core/ranks.ts`, 9 tiers Wood to Olympian, own bodyweight-ratio standards in `core/exercises.ts`),
the owner's Arnold split (`core/split.ts`: next day and a pre-filled template from history), weekly boss quests
from the two best lifts (`core/quests/fromHistory.ts`). 4.3 (history stats) folded into ranks and split.

Added 2026-10-26 (owner's requests): the owner's real notes format imports (sets first, pounds, "until failure",
no dates); a progressive-overload calculator for bosses (`core/progression.ts`: powerlifting linear, bodybuilding
double progression, calisthenics reps then weight, running distance / speed / cut-back via Riegel) with deload
weeks (every 4th / 6th / 5th week by style) and stall resets; bosses, daily quests and the map's look tailored to
the profile goal (fortress / track / trail); training style and kg / lb in the profile; hero customisation
(another character's head, palette recolours).

### M5 - Programs from a goal
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 5.1 | Program rule sets as data: couch-to-5K style, 5K→10K, half, marathon (needs a base), strength (GZCLP-style tiers), fat loss, weight gain | Claude | reviewed against the research; schema-valid | 0.2 |
| 5.2 | `core/program/generate.ts`: goal + profile + days/week + start date → `Program` | Qwen 🌙 | tests per goal (weeks, cutbacks, taper, rest days) | 5.1 |
| 5.3 | `core/program/progress.ts`: next weights/stages from logged results | Qwen 🌙 | GZCLP-style stage tests, run progression tests | 5.2 |
| 5.4 | `core/adaptiveTdee.ts`: weight-trend smoothing + intake → corrected target, with caps | Qwen 🌙 | synthetic-data tests (stable, losing, noisy, gaps) | 1.1 |
| 5.5 | Goal picker, program calendar, today's session shown as a quest | Claude | E2E: pick marathon → see week 1 → log session → quest done | 5.2-5.3 |

### M6 - Keep it safe, finish it
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 6.1 | `core/backup.ts`: export/import with zod validation and version migration | Qwen 🌙 | round-trip and bad-file tests | 0.2 |
| 6.2 | Backup UI, 7-day backup reminder, `storage.persist()` request | Claude | E2E | 6.1 |
| 6.3 | Quality gates: a11y (focus, contrast, labels), phone widths, Lighthouse PWA, `npm audit`, credits page (OFF, USDA, Kenney, fonts) | Claude | checklist in this file ticked | all |
| 6.4 | Deploy, README, retrospective in DECISIONS.md | Claude | installed on the phone from Pages | 6.3 |

### Added 2026-10-26 - custom macro targets ✅
Owner asked before M3. Profile gets optional calorie and macro targets (protein, carbs, fat in g/day); blank
ones stay automatic, and all three macros with no calorie target set the calories to their sum. Claude (a few
lines in `core/targets.ts`, tests first). E2E: custom targets show on Today, clearing them goes back to auto.

### M7 (later, not planned in detail) - Accounts: sign up, log in, sync
Owner wants this "if possible in the future". It is possible, but it changes the architecture decision
"data only on the phone", so it gets its own research and plan before any code:
- **Needs a server.** GitHub Pages only serves files. Free options to research: Supabase (Postgres + auth;
  free projects pause after a week unused), Firebase (Auth + Firestore, free Spark plan), or Strata's PC as
  the server (only reachable at home unless exposed, which needs care).
- **What it is for decides the design:** backup and a second device (sync of the same records), or social
  features (friends, shared quests, leaderboards), which need much more.
- **Keep offline-first:** IndexedDB stays the source on the phone; sync pushes and pulls records by
  `updatedAt`. Records are already plain, validated and id-keyed, which makes this feasible later.
- **Security-sensitive:** auth, passwords and personal health data. Claude builds it (not Qwen), with a
  `/security-review` before release; prefer the provider's auth (email link or Google sign-in) over storing
  passwords ourselves. A privacy note in the app says what leaves the phone.
- Until then, M6's backup file covers losing or changing the phone.

## Split and usage estimate

- **Qwen:** 17 tasks, all pure `src/core/` modules or scripts with Claude's tests. 16 of them can run overnight.
  Strata must be running for live handoffs; the overnight queue (`run-queue.bat`) restarts it if it stops.
- **Claude:** setup, the contract, all UI and art direction, scanner/camera, program content, all tests, and
  reviewing every Qwen diff. The long Claude stretches are M1's UI (1.6) and M3's game screens (3.5-3.7).
- **Not used:** taste-skill (personal app screen; saves a 30-45 min build), Lenis, HyperFrames.
- **Paid services:** none. A **public** GitHub repo with GitHub Pages is free
  ([GitHub docs](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)). The code
  is public; personal data never goes in the repo and never leaves the phone.

## Risks and handling

See [RESEARCH.md §8](RESEARCH.md#8-risks). The biggest: logging must stay fast (taps measured in E2E), phone-only
data can be lost (persist + backups), and the notes format is unknown (4.1 first, then the parser).

## Quality gates checklist (M6)

- [ ] Tests, lint and type-check pass; no console errors
- [ ] Keyboard and focus states, labels, contrast, reduced motion
- [ ] 360 px and 412 px phone widths; installed PWA works offline
- [ ] `npm audit` clean or explained; credits page lists every data source, asset and font
- [ ] Real phone: 5 barcode scans, a full day of logging, a backup restore
