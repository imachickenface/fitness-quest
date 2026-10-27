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

There is no server and no account. Everything is stored in the browser on your phone (IndexedDB). Save a backup
file regularly (gear icon on Food, "Your data"); the app reminds you after a week. Clearing the browser's site data
deletes everything; restoring a backup file brings it back.

## Credits

- Food data: [Open Food Facts](https://world.openfoodfacts.org) contributors (ODbL) and
  [USDA FoodData Central](https://fdc.nal.usda.gov) (CC0).
- Hero models: [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) (CC0).
- Fonts: Nunito and Pixelify Sans (SIL Open Font License).
- Libraries: three.js, React, zod, zxing-wasm, barcode-detector (MIT); Dexie (Apache 2.0).
