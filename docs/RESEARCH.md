# Research (2026-10-26)

All findings were checked against live sources on 2026-10-26. Where sources disagreed, the note says so.

## 1. Low-effort calorie logging

**How the leading trackers make it fast.** MacroFactor publishes a "Food Logger Speed Index" that counts the taps
needed for common logging jobs. It ranks itself fastest, at 24 actions against 40 for a rival. That is the
vendor's own test, and an independent 2026 table puts MyFitnessPal slightly ahead on raw speed. What the fast apps
share: a "speed mode" by default, recent and favourite foods one tap from the home screen, a barcode scanner, and
meals saved as one item.
([MacroFactor FLSI 2025](https://macrofactorapp.com/fastest-food-logger-2025/),
[MacroFactor vs Cronometer](https://macrofactor.com/macrofactor-vs-cronometer/),
[third-party table](https://programminginsider.com/10-best-macro-tracking-apps-2026/))

**Options compared, for this user (Android, free only, one person):**

| Option | Effort per log | Accuracy | Cost | Verdict |
|---|---|---|---|---|
| One-tap recents / favourites / saved meals | 1 tap | as good as the first entry | free | **Core.** Most meals repeat, so this covers most days. |
| Barcode scan → Open Food Facts | scan + pick portion | good for packaged food | free | **Core** for packaged food. |
| Search generic foods (USDA) | type 3-4 letters, pick | good | free | **Needed** for unpackaged food (eggs, rice, fruit). |
| Quick-add calories ("650 kcal") | type a number | rough | free | **Fallback** for restaurants and guesses. |
| Natural language ("2 eggs and toast") | type a sentence | depends on parser | free with local Qwen, but only when the PC is on | Later, optional. |
| Photo estimate | snap | lowest | paid API | Out (the user chose free; least accurate). |

**Recommendation:** one home screen where the first row is your recent and favourite foods and saved meals (one
tap logs them), plus a big scan button and a search box. Quick-add calories as the escape hatch. This is the
MacroFactor "speed mode" pattern with free data sources.

### Open Food Facts (barcodes)
- Read API: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=...`; v3 (v3.6) is the
  newest version. No key or login needed to read.
  ([API docs](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/))
- Limits: 15 product reads/min per IP and 10 searches/min per IP; search-as-you-type is explicitly discouraged.
  A custom User-Agent (`AppName/Version (contact)`) is required.
  ([API docs](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/),
  [conditions](https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api))
- **Tested live from this PC:** the v2 product call with a `fields=` filter returns `energy-kcal_100g`, proteins,
  carbs, fat and `serving_size`, and answers with `Access-Control-Allow-Origin: *` and allows an `X-User-Agent`
  header. A browser cannot set `User-Agent` itself, so the app sends `X-User-Agent` instead, and it can call the
  API straight from the phone with no server.
- Licence: database ODbL, contents DbCL, images CC BY-SA 3.0. Show "Data from Open Food Facts" in the app; cache
  looked-up products locally (fine for personal use).
- Gaps: coverage varies by country, and some products lack nutrition data. The app must let the user type the
  label values in when a product is missing (the entry is saved locally and becomes a one-tap favourite).

### USDA FoodData Central (generic foods)
- API needs a free data.gov key and allows 1,000 requests/hour, but the key would ship inside a public web
  app. ([API guide](https://fdc.nal.usda.gov/api-guide))
- Better: **bundle a trimmed offline food list** from the downloads. Foundation Foods (April 2026) is 459 KB
  zipped JSON; SR Legacy (2018) is 12.3 MB zipped JSON / 6.7 MB zipped CSV. Branded (3.1 GB) is not needed because
  Open Food Facts covers barcodes. ([downloads](https://fdc.nal.usda.gov/download-datasets/))
- Licence: CC0 / public domain, attribution requested. ([API guide](https://fdc.nal.usda.gov/api-guide))
- Plan: a build-time script turns SR Legacy + Foundation into a compact JSON of roughly 8,000 foods (name,
  kcal/protein/carb/fat per 100 g, common portions), which can be searched offline with no key and no rate limit.
  The size after trimming has to be measured; the target is under 1 MB gzipped.

### Barcode scanning on Android Chrome
- Chrome for Android supports the native `BarcodeDetector` API; on Android it detects EAN-13, EAN-8, UPC-A
  and UPC-E, the food barcode formats. Desktop Chrome on Windows does not, so it cannot be tested on this PC.
  caniuse lists support from Chrome Android 151/152.
  ([caniuse](https://caniuse.com/mdn-api_barcodedetector), [MDN notes](https://docs.w3cub.com/dom/barcode_detection_api))
- Fallback: `barcode-detector` 3.2.3 (MIT), a polyfill with the same API on top of `zxing-wasm` 3.1.6 (MIT).
  Load it only when the native API is missing (this also makes scanning testable on the PC and in Playwright).
- The camera needs HTTPS, which GitHub Pages provides.

## 2. Game layer: what works, what backfires

- **Habitica** (life-RPG): people praise the structure (XP, gold, items for real actions) and the party quests.
  Main complaints: "gamification fatigue", the game turns into its own chore, and RPG elements feel like extra
  work to people who aren't into RPGs.
  ([review](https://smartbitchestrashybooks.com/reviews/tech-review-habitica/),
  [2026 review analysis](https://unstar.app/blog/streaks-habitica-way-of-life-strides-habit-tracking-apps-ranked-2026))
- **Zombies, Run!**: story missions wrapped around real runs (200+ missions); the story is the reward, not
  points. ([listing](https://apps.apple.com/app/id994882113))
- **"Solo Leveling"-style apps** (Solo Level: System, Level Up, LevelUP: Fitness): daily quests with a timer,
  E-to-SSS ranks, dungeons and items. Mostly store listings, so their claims are unverified.
  ([Solo Level: System](https://m.apkpure.com/solo-level-system/com.RedDragon.SoloLevel),
  [LevelUP: Fitness](https://apps.apple.com/app/id6499099763))
- **Duolingo streaks**: the best-documented evidence. Streak Freeze adds slack, and letting users hold two
  freezes raised daily active learners by +0.38%. Duolingo cites a Penn/UCLA study finding that some slack
  motivates more than rigid rules. Loss aversion drives streaks, and the first 7 days matter most.
  Critics note that streaks can cause anxiety and compulsive use.
  ([Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit),
  [CMU write-up](https://cmu-uxa.notion.site/Performative-Progress-Strava-Mules-Duolingo-Streaks-1c18eb2b3ca480f59cd2e4123ac0d7d2))

**Borrow:** XP for real actions; daily and weekly quests generated from the user's own data; a story or map
progression as the reward; streak freezes earned by play; a small daily minimum that keeps a streak alive (log
anything), not a full-goal requirement.
**Avoid:** game chores that are not fitness (inventory management, gold economies); punishing a missed day; timers
that guilt; XP for overeating or overtraining (quests reward hitting a range, not more of anything).

## 3. Program generation from a goal

The app builds programs from rules (templates plus progression), not copied plans. Published plans are
copyrighted, but the principles behind them are not.

- **Calorie targets:** Mifflin-St Jeor BMR × activity factor, about ±10% error; the biggest error source is
  over-stated activity. Loss: 10-25% deficit, roughly 0.5-1 kg/week at most. Lean gain: +200-500 kcal surplus,
  about 0.1-0.25 kg/week. 7,700 kcal/kg is the usual rough conversion. Re-estimate after 2-3 weeks from the weight
  trend and the logged intake (the "adaptive TDEE" idea MacroFactor uses). Calculator sites only, so these are
  treated as defaults, not facts.
  ([example](https://www.evigrade.com/en/calculators/weight-loss-calories),
  [TDEE note](https://calculate.co.nz/tdee-calculator.php))
- **Beginner running (cardio / 5K):** NHS Couch to 5K: 9 weeks, 3 runs a week with a rest day between, starting
  with 60 s run / 90 s walk intervals in a ~20-minute session, ending with 30 minutes of continuous running.
  ([NHS C25K summary](https://healthwell.eani.org.uk/healthtopic/get-fit/couch-5k-week-week?type_1=1))
- **Marathon:** beginner plans are 16-18 weeks with a cutback week about every 4th week and a 3-week taper.
  The peak long run is 17-20 miles (27-32 km) and the peak week 27-40 miles (43-64 km), depending on the base.
  Prerequisites vary from 3-5 comfortable miles to a recent half marathon. The app should require a base (for
  example, able to run 5 km) or chain C25K → half → full.
  ([TrainingPeaks](https://www.trainingpeaks.com/training-plans/running/marathon/tp-575231/beginner-marathon-plan-18-weeks-3-days-week),
  [Run Dream Achieve](https://rundreamachieve.com/18-week-marathon-training-plan/),
  [Fitness First PDF](https://fitnessfirst.co.uk/media/qeymxcyl/fitness-first-beginner-marathon-plan.pdf))
- **Strength / muscle gain:** GZCLP-style linear progression: tiered main lifts (T1 3×10 → 3×8 → 3×6 when sets
  are failed, then reset heavier), T2 lifts, and T3 accessories at 3×15+ that go up after 25+ reps on the last
  set. Increments: small for bench and overhead press, larger for squat and deadlift. Third-party summaries only;
  the exact numbers are defaults the user can change.
  ([Liftosaur GZCLP](https://liftosaur.com/programs/gzclp), [Boostcamp](https://www.boostcamp.app/methodology/gzcl))
- **Weight loss / gain:** the calorie target from above plus 3 strength days and 2 cardio days (loss) or 3-4
  strength days (gain), using the same progression rules.

## 4. Importing the user's workout notes

The notes are plain text, so the format is unknown until the user shares samples. Common shapes to support:
`Bench 3x8 60kg`, `Squat 100x5x3`, `ran 5k 28:30`, a date line followed by exercise lines, and RPE notes.
Plan: a deterministic parser (fast, testable, runs on the phone) that shows lines it could not read for a quick
manual fix. Optional: a PC script that sends the leftover lines to the local Qwen through Strata and writes JSON
for the app to import. This stays on the PC because the phone cannot reach the PC's `127.0.0.1`, and Chrome 142+
asks for a Local Network Access permission before a website may call a local server.
([Chrome LNA](https://developer.chrome.com/blog/local-network-access))

**Not possible from a web app:** reading Android Health Connect (steps, watch workouts). It is an Android SDK
only, so it would need a native companion app. Left out of v1.
([Health Connect availability](https://developer.android.com/health-and-fitness/guides/health-connect/plan/availability))

## 5. Tech stack (npm versions checked 2026-10-26)

| Piece | Choice | Version | Licence | Note |
|---|---|---|---|---|
| Build | Vite | 8.3.5 | MIT | |
| UI | React | 19.3.1 | MIT | matches the user's motion stack (`useGSAP`) |
| Language | TypeScript | 7.0.2 | Apache-2.0 | 7.x is the new native compiler; fall back to 6.x if a tool breaks |
| PWA | vite-plugin-pwa | 2.0.0 | MIT | peer `vite ^8` OK; Workbox 7 |
| Storage | Dexie (IndexedDB) | 4.4.7 (+ dexie-react-hooks 4.4.0) | Apache-2.0 | |
| Schema checks | zod | 4.6.7 | MIT | validates imports and backups |
| Barcode fallback | barcode-detector | 3.2.3 | MIT | zxing-wasm 3.1.6 inside |
| Unit tests | Vitest + fake-indexeddb | 5.0.5 / 6.2.6 | MIT / Apache-2.0 | peer `vite ^8` OK |
| E2E | Playwright | 1.64.1 | Apache-2.0 | phone viewport, camera mocked |
| Motion | GSAP + @gsap/react | 3.15.0 | GSAP standard no-charge licence | XP pops, level-ups, quest complete |
| Smooth scroll | Lenis | 1.3.27 | MIT | probably **not** used: an app shell with short screens doesn't need it |
| Map | own small Canvas 2D renderer | - | - | Phaser 4.2.1 (MIT) is too heavy for one map with a walking sprite |

**Storage risk:** data lives only in the phone's browser. Chrome may evict it unless persistent storage is
granted, and installing the PWA is one of Chrome's signals for granting it; the app calls
`navigator.storage.persist()`. The user can still clear it. So: a backup-export button, a reminder when the last
backup is over 7 days old, and import that validates the file.
([web.dev offline data](https://web.dev/learn/pwa/offline-data),
[persistent storage](https://web.dev/articles/persistent-storage))

## 6. Pixel art

- **Kenney Tiny Town** (16×16 tiles, CC0) and **Tiny Dungeon** (same series), plus **Tiny Creatures** by Clint
  Bellanger (180 16×16 sprites, CC0, made for those packs). Enough for an overworld map, a hero and monsters
  ("boss" quests) with no attribution needed. ([Tiny Town](https://kenney.nl/assets/tiny-town),
  [Tiny Creatures](https://opengameart.org/content/tiny-creatures))
- Custom art (a unique hero) would need ComfyUI (parked in `~/.claude/tool-notes/`) or the user's own pixel art.
  Not needed for v1.
- Pixel font: a free Google Font under the OFL (Pixelify Sans or Press Start 2P); the licence is checked at setup.

## 7. Tools already set up

- **Qwen worker / overnight queue:** suits the pure-logic modules (parsers, calculators, quest rules, program
  generator, USDA data script), each with Claude-written tests. Strata was **not running** at research time
  (`--check` refused), so Qwen tasks go to the overnight queue or wait until the user starts Strata.
- **taste-skill:** not used. This is a personal app screen, not a public page; its app-screen mode exists, but the
  pixel-art direction is set by the asset packs. Saves a 30-45 minute build.
- **GSAP:** yes, for game feedback (XP pop, level-up, quest-complete). **Lenis:** no (see above).
  **HyperFrames:** not needed. **React Bits:** maybe one or two effects if they fit the pixel style.
- **GitHub:** `gh` is logged in as `imachickenface`, so the app can be deployed to GitHub Pages.

## 9. Accounts and sync (checked 2026-10-27)

- **Supabase free plan** ([pricing](https://supabase.com/pricing)): 50,000 monthly active users, 500 MB
  database per project, 2 active projects, "Free projects are paused after 1 week of inactivity". Pro is
  $25/month.
- **Supabase email** ([SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp)): the built-in sender
  allows 2 messages an hour, only to the project's team, and "is not meant for production use". Real email
  sign-in needs a custom SMTP service.
- **Email codes** ([passwordless docs](https://supabase.com/docs/guides/auth/auth-email-passwordless)):
  `signInWithOtp` sends a magic link unless the template shows `{{ .Token }}`; `verifyOtp` checks the code;
  one request per 60 s, codes expire after 1 hour by default.
- **Resend** ([pricing](https://resend.com/pricing)): free plan 3,000 emails a month, 100 a day, 3 domains.
- **Google sign-in** ([docs](https://supabase.com/docs/guides/auth/social-login/auth-google)): a Web
  application OAuth client, the Supabase callback as redirect URI, scopes openid, email and profile. The
  docs tie Google's app verification to sensitive or restricted scopes, not these basic ones.
- **Client library:** `@supabase/supabase-js` 2.118.0, MIT, actively maintained (pushed 2026-10-27).
- **Alternatives checked:** Dexie Cloud (built-in sync for Dexie, but the free plan has 3 production
  users; €0.12 per user a month after that) and Firebase Spark (50,000 monthly users, Firestore 1 GiB,
  50,000 reads and 20,000 writes a day; would mean replacing the app's storage). The owner chose Supabase
  so the app stays free for many users.

## 10. Friends and profiles (checked 2026-10-27)

**How other fitness apps do it**
- **Hevy** ([social guide](https://help.hevyapp.com/hc/en-us/articles/35688036014231-Hevy-App-Social-Guide-Connect-Follow-and-Share-Your-Workouts),
  [social features](https://www.hevyapp.com/features/social-features/)): public by default, with a private
  profile where followers must be approved; each workout can be public, followers-only or private;
  leaderboards rank your best lift on 38 exercises against your friends. *Borrow:* lift leaderboards among
  friends, per-item privacy. *Avoid:* public by default.
- **Strava** ([Tom's Guide](https://tomsguide.com/wellness/fitness/how-to-adjust-your-strava-privacy-settings),
  [Kaspersky](https://www.kaspersky.co.za/blog/running-apps-privacy-settings-part2-strava/33876)): follower
  approval, hidden start and end points and hidden maps, because public run maps have exposed people's
  homes. *Borrow:* nothing location-based leaves the phone. Fitness Quest stores no GPS, so there is none
  to leak.
- **Duolingo** ([friends](https://blog.duolingo.com/friends-social-features/),
  [Friends Quests](https://blog.duolingo.com/friends-quests/),
  [Friend Streak](https://blog.duolingo.com/friend-streak/)): Friends Quests pair two mutual friends on a
  shared weekly goal; a Friend Streak needs both people to keep it alive and has to be accepted first; up to
  5 at once; you can opt out. *Borrow:* shared quests that the friend accepts first, a limit on how many run
  at once, and an opt-out.

**What this means for Fitness Quest:** friends only, never public; adding someone needs their yes (a
request or an invite they open); everything shared is a summary the app publishes, never the raw records;
no body weight, calories or food leave the account.

**Tech**
- **Access rules for friendships** ([Supabase discussion](https://github.com/orgs/supabase/discussions/4509),
  [MakerKit RLS guide](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)): a policy that
  reads the friendships table from another policy is usually done with a `security definer` helper. It
  must pin `search_path`, check `auth.uid()` inside, and have `execute` revoked from `public`/`anon`,
  because Postgres grants `execute` to everyone by default.
- **QR codes:** `uqr` 0.1.3 ([unjs/uqr](https://github.com/unjs/uqr)): MIT, no dependencies, no install
  scripts, 79 KB unpacked, 782 stars, last push 2026-04-03, 0 open issues; it renders an SVG. `qrcode`
  1.5.4 is MIT too but pulls in `pngjs` and `yargs`. A phone's own camera app opens a QR link, so the app
  needs no QR scanner.
- **Avatars:** the hero is a 3D model (Kenney Mini Characters, CC0). Twelve heads give twelve portraits, so
  friend lists can use small pre-rendered images and only a friend's profile page loads the 3D hero.

## 11. Steps, RIR and calories burned (checked 2026-10-29)

**Can a web app count steps with the screen locked? No.**
- Browsers stop motion-sensor events when the page is hidden. The cross-browser Web Platform Tests check
  exactly this ([devicemotion page-visibility test](https://searchfox.org/firefox-main/source/testing/web-platform/tests/orientation-event/motion/page-visibility.https.html)),
  and Chrome ties sensor-style APIs to page visibility and screen-off
  ([Chromium engineer, W3C list](https://lists.w3.org/Archives/Public/public-device-apis/2014Jan/0039.html)).
- iOS suspends a web app (Safari or installed) about three seconds after it leaves the screen
  ([Frontend Masters, background JavaScript](https://frontendmasters.com/courses/background-javascript/observing-mobile-background-javascript)).
- A web app can't read the phone's own step counter: Apple Health has no web access, and Android's Health
  Connect is on-device only. Google Fit's APIs are deprecated; the cloud successor, the Google Health API,
  is still reaching parity with Health Connect in Q4 2026 to Q1 2027
  ([Google Health API](https://developers.google.com/health/about), [Sahha, July 2026](https://sahha.ai/blog/fitbit-api-sunset-migration/)).
- Only a store app (a native wrapper using HealthKit / Health Connect) can count all day with the screen
  locked. That costs Apple's $99 a year and a Mac or cloud build for iPhone, so it is left for later.

**What works in a web app**
- **Motion-sensor counting while the app is open.** The Screen Wake Lock API keeps the screen from
  locking; it works in installed iPhone web apps from iOS 18.4
  ([MDN compat data](https://chromium.googlesource.com/external/github.com/mdn/browser-compat-data/+/73d346309ee9d8be7e32fda8ff574d4c79dd4c51/api/WakeLock.json),
  [progressier](https://progressier.com/pwa-capabilities/screen-wake-lock)). The lock is dropped when the
  app is left, and iPhone asks for motion permission (`DeviceMotionEvent.requestPermission()`).
- **iPhone: the phone's own count through Apple Shortcuts.** The Health app counts steps all day, locked or
  not. A shortcut can read today's step count from Health and open the app with it, one tap from the home
  screen, a widget or Siri ([Apple Shortcuts guide](https://support.apple.com/guide/shortcuts/apd690170742/ios),
  [example](https://www.addictivetips.com/ios/get-daily-step-count-siri-shortcut)). An automation that runs
  by itself fails while the phone is locked, because Health data is locked then
  ([Home Assistant forum](https://community.home-assistant.io/t/ios-steps-showing-incorrect-data/553185)).
  So it's a tap, not fully automatic.
- **Android:** no web route to the phone's own count; the motion counter, or typing the total in.

**Calories burned: the method**
- Energy = MET × body weight (kg) × hours. The app shows *active* calories, (MET − 1) × kg × hours, the
  part on top of what the body burns at rest, the same idea as a watch's "active calories".
- **Lifting:** 2024 Adult Compendium code 02054, multiple exercises at 8-15 reps, **3.5 MET**; code 02052,
  heavy squats and deadlifts, **5.0 MET** ([conditioning exercise](https://pacompendium.com/conditioning-exercise),
  [2024 Compendium paper](https://pubmed.ncbi.nlm.nih.gov/38242596/)). The workout form records no
  duration, so a set counts as 3 minutes with its rest.
- **Steps:** 10,000 steps ≈ 4.25 MET-hours at 3 MET ([PMC table](https://pmc.ncbi.nlm.nih.gov/articles/PMC3085087/table/T1)),
  so about 200 active kcal for a 70 kg person.
- **Runs:** about 1 kcal per kg per km, the classic running estimate, less the resting part.
- Estimates like these are off by 20-30% for a given person, so the app says "about" and keeps it out of
  the food target (the activity level already counts usual exercise).

## 8. Risks

| Risk | Impact | Handling |
|---|---|---|
| Logging still feels like a chore | the whole point fails | Speed-mode home screen; measure taps per log in E2E tests (target: ≤ 2 taps for a repeat meal, ≤ 4 for a scan) |
| Phone data lost (eviction, cleared browser) | lose history and progress | `storage.persist()`, export reminder, validated import |
| Open Food Facts gaps or rate limits | scan finds nothing | manual label entry saved as a favourite; local product cache; at most a few scans per minute in normal use |
| Notes format is messier than expected | import misses workouts | samples from the user turned into parser test fixtures; an "unparsed lines" fix screen; optional Qwen helper on the PC |
| Game layer becomes a chore (Habitica's failure) | user stops | quests come from things the user already does; no non-fitness grind; streak freezes |
| Bad targets (formula error ±10%, unsafe deficits) | health risk | caps on deficit and surplus, adaptive correction from the weight trend, a not-medical-advice note |
| Barcode scan can't be tested on PC | bugs found late | polyfill in tests; a real-phone check at the end of milestone 2 |
