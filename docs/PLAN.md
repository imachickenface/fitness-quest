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
| 5.1 | ✅ Program rules: couch-to-5K, 10K, half, marathon (needs an 8 km base), steady cardio; lifting on the Arnold split by training style with deload weeks; weight loss adds 2 cardio days | Claude | briefs + tests written from the research | 0.2 |
| 5.2 | ✅ `core/program/running.ts`, `lifting.ts` (Qwen), `generate.ts` (Claude): goal + style + days/week + start date → `Program` | Qwen + Claude | tests per goal (weeks, cutbacks, taper, rest days, deloads) | 5.1 |
| 5.3 | ✅ Weights for each session come from the M4b progression calculator (`progression.ts`), no separate `progress.ts` | Claude | session sheet pre-filled; e2e | 5.2 |
| 5.4 | ✅ `core/adaptiveTdee.ts`: weight trend (EWMA) + 28 days of intake → measured maintenance, capped at ±25% of the formula; suggested in the profile sheet | Qwen + Claude | synthetic-data tests (stable, losing, gaps, caps) | 1.1 |
| 5.5 | ✅ Program sheet, week strip, next session card, today's session as a 60 XP quest | Claude | E2E: start a program → see the week → log the session → quest done | 5.2-5.3 |

### M6 - Keep it safe, finish it
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 6.1 | ✅ `core/backup.ts`: export/import with zod validation and step-by-step version migration | Qwen | round-trip, bad-file and migration tests | 0.2 |
| 6.2 | ✅ Backup UI (save, restore with a confirm), 7-day reminder on Food, `storage.persist()` on start | Claude | db tests + 3 E2E | 6.1 |
| 6.3 | ✅ Quality gates: contrast and control names swept on every screen in light and dark (all pass after a palette fix), 3 px focus ring, 360 px screenshots, Lighthouse mobile 96 / 100 / 100 / 100, `npm audit` 0, credits in the app and README | Claude | this row | all |
| 6.4 | ✅ Deploy, README, retrospective in DECISIONS.md | Claude | Pages deploy green | 6.3 |


### M6b - Exercise library and run types (owner's request)
| # | Task | Owner | Done when | Depends |
|---|---|---|---|---|
| 6b.1 | ✅ free-exercise-db (876 exercises, public domain) slimmed to `public/exercises.json`; the 32 ranked lifts mapped by id | Claude | `art/slim_exercises.py` | - |
| 6b.2 | ✅ `core/exerciseLibrary.ts`: forgiving search, body-part and equipment filters | Claude (Qwen failed twice) | unit tests | 6b.1 |
| 6b.3 | ✅ Exercise picker with how-to; custom names still allowed | Claude | e2e | 6b.2 |
| 6b.4 | ✅ 14 run types and a picker on the run sheet; program sessions preselect theirs | Claude | unit + e2e | - |

### Added 2026-10-26 - custom macro targets ✅
Owner asked before M3. Profile gets optional calorie and macro targets (protein, carbs, fat in g/day); blank
ones stay automatic, and all three macros with no calorie target set the calories to their sum. Claude (a few
lines in `core/targets.ts`, tests first). E2E: custom targets show on Today, clearing them goes back to auto.

### M7 - Accounts and sync with Supabase (done 2026-10-27: Google sign-in only)

**Goal:** sign in on any phone and see the same data; the app keeps working fully offline and without an
account. Research: `docs/RESEARCH.md` section 9.

**Architecture**
- **Supabase** (free plan: 50,000 monthly users, 500 MB database, 2 projects, paused after 1 week unused).
  Two projects: `fitness-quest` (live) and `fitness-quest-test` (tests and test accounts only).
- **Client:** `@supabase/supabase-js` 2.118.0 (MIT). Only the project URL and the *publishable* key ship in
  the app; both are public by design. The service-role key never leaves the Supabase dashboard.
- **Offline-first sync:** IndexedDB (Dexie) stays the source of truth on the phone. One server table,
  `records (user_id, kind, id, data jsonb, updated_at, deleted)`, primary key `(user_id, kind, id)`:
  - changes are found by comparing each record's fingerprint with the one it had at the last sync (the
    `synced` table): changed and new records are pushed, missing ones become deletes - no write log, so
    nothing can be lost if the app is closed mid-write (decided while building; see DECISIONS);
  - pull = rows with `updated_at` after the last pull; `updated_at` is set by the server (a trigger), so
    phone clocks don't matter;
  - conflicts: the newest server write of a record wins; deletes are kept as tombstones (`deleted`);
  - every pulled row is checked with the zod contract before it touches IndexedDB; bad rows are skipped
    and reported, never written.
  - Synced: profile, foods the user made or favourited, food entries, saved meals, workouts, weigh-ins,
    programs, quests. Not synced: device settings (backup date, storage permission), cached search foods.
- **Access rules (Row Level Security):** a user can only select, insert, update or delete rows where
  `user_id = auth.uid()`. The only other table, `usernames`, has the same rule (no deletes).
- **Sign-in:** Google sign-in first (free, no email service needed). Email codes need a sending service
  (Supabase's built-in one sends 2 emails an hour, only to the project team) - see decision below.
- **First sign-in on a phone with data:** if the account is empty, the phone's data is uploaded; if both
  have data, the app asks: "Combine both" (default; newest version of each record wins), "Use the
  account's" or "Use this phone's". A backup file is saved automatically before anything is replaced.
- **Username (added 2026-10-27, owner's request):** after the first sign-in the account must pick a
  username before anything syncs. Unique across all accounts ignoring capitals, 3-20 letters, numbers or
  `_`; table `usernames` (`supabase/migrations/002_usernames.sql`), own row only, changeable in Account.
- **Sign out:** asks whether to keep the data on this phone. **Delete account:** removes the account and
  every row (a database function that only deletes the caller's own data), after typing DELETE.

**Decisions for the owner**
1. Sign-in method: Google only to start (recommended), or also email codes. Email codes need a free
   Resend account (3,000 emails a month, 100 a day) and, for reliable delivery to anyone, a domain you own
   (about $10 a year).
2. While few people use it, a weekly GitHub Action pings the database so the free project is never paused.

**What the owner does (Claude cannot create accounts)**
- Create a Supabase account and the two projects; send Claude each project's URL and publishable key.
- Create a Google Cloud OAuth client (Web application) with the redirect URL Claude gives; paste its
  client id and secret into Supabase's Google provider page. Step-by-step notes: [`docs/ACCOUNTS.md`](ACCOUNTS.md).

**Tasks** (all Claude: authentication, access rules and sync are security-sensitive or tricky logic, which
the delegation rules keep away from Qwen)

| # | Task | Done when | Depends |
|---|---|---|---|
| 7.1 | ✅ `supabase/migrations/001_records.sql`: table, server-time trigger, RLS policies, `delete_my_account()` | applied to the test project; access test: user A cannot read, change or delete user B's rows, signed-out requests see nothing | owner setup |
| 7.2 | ✅ `core/sync.ts`: pure merge of local and remote records (newest wins, tombstones, zod check) | unit tests: conflicts, deletes, bad rows, clock skew | - |
| 7.3 | ✅ `sync/engine.ts` + `sync/supabase.ts`: fingerprint diff, pull then push, first sync with combine / account / phone | two-phone tests on an in-memory server; e2e on the test project with two browser contexts; live access test with two test users | 7.1, 7.2 |
| 7.4 | ✅ Account UI in "Your data": sign in with Google, signed-in-as, last synced, sign out, delete account, first-sign-in choice | e2e (test project, password test users only there); screenshots at 360 px | 7.3 |
| 7.5 | ✅ Privacy note: what is stored, where (Supabase, EU or US region chosen at setup), how to delete | in the app and README | 7.4 |
| 7.6 | ✅ Keep-alive GitHub Action; `/security-review`; `npm audit`; deploy | review findings fixed; deploy green | all |

**Usage estimate:** Claude-only, about 3-4 sessions; the access-rule tests and the sync engine are the bulk.

**Risks**
| Risk | Effect | Handling |
|---|---|---|
| A sync bug loses or duplicates data | user loses history | backup file before first sync; tombstones instead of hard deletes; merge unit tests; zod check on every pulled row |
| Access rules wrong | one user sees another's health data | RLS on the only table, tested with two real test accounts; security review before release |
| Free project paused or limits reached | sync stops (app still works offline) | weekly keep-alive; 500 MB is roughly 0.5-1 MB per active user a year, so about 500-1,000 active users before paying ($25/month Pro) |
| Google sign-in setup mistakes | sign-in fails | written steps in `docs/ACCOUNTS.md`; tested on the test project first |
| Health data privacy | trust, legal | privacy note, delete-account button, export via backup file; no analytics |
- Until then, M6's backup file covers losing or changing the phone.

### M8 - Friends and profiles (planned 2026-10-27, waiting for the owner's yes)

**Goal:** add friends, show off a custom profile, and compete and train together, without any health data
going public. Research: `docs/RESEARCH.md` section 10.

**The owner's choices (2026-10-27)**
- Friends see: profile and level, workouts and quests, lift ranks and PRs. *Not* weight, calories or food.
- Adding: by exact username with a request, **and** by invite link or QR code.
- Profile: the hero as avatar, a short bio and an unlocked title, a showcase.
- Together: a friends leaderboard, cheers, shared quests.

**Architecture**
- **Friends only, never public.** No search or list of users. Adding someone always needs their yes (they
  accept the request, or they made the invite).
- **What friends see is a summary the phone publishes, never the records.** `records` stays readable only
  by its owner. After each sync the phone works out a small summary and uploads it, only when it changed:
  - **profile:** hero head and colours, bio (max 150 characters), title, showcase (max 3 badges, 3 lifts,
    current program name), level, total XP, this week's XP, overall lift rank and the top lift ranks;
  - **activity:** the last 30 days of workouts (name, date, sets, duration; no notes), finished quests and
    new PRs.
- **Server (migration `003_social.sql`), all behind access rules:**
  - `profiles`, `activity`: written only by the owner; read by the owner and accepted friends.
  - `friendships`: one row per pair; status pending, accepted or blocked. It is changed only through
    functions that act for the signed-in user: send a request by username, accept, decline, remove, block.
    A blocked person can't send another request.
  - `invites`: a random token, valid 7 days, shared as `.../fitness-quest/#invite=<token>`. The `#` part
    never reaches a server log. Opening it and tapping "Add friend" makes you friends: the invite was the
    owner's yes.
  - `cheers`: one per friend per activity; friends add them, the owner sees who cheered.
  - `challenges` and `challenge_progress`: a friend accepts first; at most 3 running per person; each side
    writes only its own progress.
  - `usernames`: friends can now read each other's names. Strangers still can't.
  - Limits in the database: at most 20 open requests sent, 5 live invites and 100 friends.
- **Phone:**
  - pure modules in `src/core/social/` work out what to publish (profile summary, weekly XP, titles,
    activity, challenge progress, leaderboard order);
  - a publish step runs after each sync;
  - a new **Friends** tab is added at the end of the tab bar (Food, Train and Quests keep their order). It
    holds the leaderboard, friends, requests and Add friend (username, invite link, QR code). Your profile
    opens from there and from the hero.
- **Avatars:** 12 small pre-rendered portraits, one per hero head, with the hero's main colour as the
  background ring. Only a friend's profile page loads the 3D hero.
- **What could be faked:** XP and lifts are counted on each phone, so someone determined could fake their
  numbers. That's acceptable among friends, since nothing is ranked publicly.
- **New dependency:** `uqr` 0.1.3 (MIT, no dependencies, no install scripts) for the QR code.

**Tasks** (Q = Qwen with Claude's tests, can run overnight; C = Claude)

| # | Task | Owner | Done when | Needs |
|---|---|---|---|---|
| 8.1 | Contract types for the published summary; `003_social.sql` (profiles, friendships, usernames for friends, request functions, block, limits); applied to the test project | C | live access tests with test users A and B: strangers see nothing, requests need a yes, blocks hold, limits hold | - |
| 8.2 | `core/social/summary.ts`: profile summary, weekly XP and top lifts from records | Q | Claude's unit tests | 8.1 |
| 8.3 | `core/social/titles.ts`: which titles are unlocked (levels, streaks, lift ranks) | Q | unit tests | 8.1 |
| 8.4 | Publish after sync (only on change); profile editor (avatar, bio, title, showcase); 12 portraits | C | e2e: edit profile, friend sees it | 8.2, 8.3 |
| 8.5 | Friends tab: add by username, requests, accept and decline, remove, block, friend's profile | C | e2e with test users A and B | 8.4 |
| 8.6 | Invites: SQL functions, link, QR code | C | live tests (expiry, reuse, own invite); e2e opening a link | 8.5 |
| 8.7 | Activity and cheers: `core/social/activity.ts` (Q), SQL and feed UI (C) | Q+C | unit tests; live tests (only friends can cheer); e2e | 8.5 |
| 8.8 | Leaderboard: `core/social/leaderboard.ts` (Q), UI (C) | Q+C | unit tests (ties, new week); e2e | 8.4 |
| 8.9 | Shared quests: `core/social/challenge.ts` progress (Q), SQL and UI (C) | Q+C | unit tests; live tests (accept first, max 3, own progress only); e2e | 8.7 |
| 8.10 | Security review, privacy page, docs, deploy, apply the migration to live | C | `/security-review` with no findings left; live checks | all |

**Order:** 8.1-8.5 first (friends and profiles work end to end), then invites, activity and cheers, the
leaderboard, and shared quests. Each ships when its tests pass.

**Usage:** mostly Claude, since the access rules and screens can't go to Qwen. Qwen takes 5 pure modules
(8.2, 8.3 and the Q halves of 8.7-8.9). No paid services; the summaries are a few KB per user, well inside
the free Supabase plan.

**Risks**
- *Access rules wrong, so a stranger sees a profile:* every rule gets a live test with two real accounts;
  security review before the live migration.
- *Spam requests:* exact usernames only, database limits, decline and block.
- *Health data leaking through the summary:* the summary is built from an allow-list of fields in the
  contract (zod), and tests check that no weight, calories or food appear in it.
- *Two features changing one screen:* the Friends tab is new, so existing screens only gain a profile link.

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
