# Fitness Quest

A personal fitness app that plays like a small pixel-art adventure. Log food in a tap or a barcode scan, log
workouts, complete quests, earn XP and move your hero across the map. Installs on an Android phone as a web app;
all data stays on the phone.

**Live:** https://imachickenface.github.io/fitness-quest/ (open in Chrome on Android, then "Add to Home screen" /
"Install app").

Status: early development. See [docs/PLAN.md](docs/PLAN.md) for milestones.

## Run it locally

Needs Node 24.

```bash
npm install
npm run dev
```

Then open http://localhost:5173/fitness-quest/.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

## Data and privacy

Everything is stored in the browser on your phone (IndexedDB). An account is optional: **Sign in with Google**
(gear icon on Food, "Account") copies your records to Supabase so they sync between your phones; each account can
only ever read its own records. Without an account, nothing leaves the phone except barcode lookups. See the
[privacy page](https://imachickenface.github.io/fitness-quest/privacy.html) and [docs/ACCOUNTS.md](docs/ACCOUNTS.md).
Save a backup file regularly ("Your data"); the app reminds you after a week. Clearing the browser's site data
deletes the phone's copy; restoring a backup file or signing in brings it back.

## Credits

- Food data: [Open Food Facts](https://world.openfoodfacts.org) contributors (ODbL) and
  [USDA FoodData Central](https://fdc.nal.usda.gov) (CC0).
- Exercise library: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain).
- Hero models: [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) (CC0).
- Badges (`public/badges/`): supplied by the app's owner, cut from one sheet with `art/slice_badges.py`.
- Fonts: Nunito and Pixelify Sans (SIL Open Font License).
- Libraries: three.js, React, zod, zxing-wasm, barcode-detector, supabase-js, uqr (MIT); Dexie (Apache 2.0).
