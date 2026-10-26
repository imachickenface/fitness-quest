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

There is no server and no account. Everything is stored in the browser on your phone (IndexedDB). Export a backup
file from the app regularly: clearing the browser's site data deletes everything.

## Credits

- Food data: [Open Food Facts](https://world.openfoodfacts.org) (ODbL) and
  [USDA FoodData Central](https://fdc.nal.usda.gov) (CC0) - added in milestones 1 and 2.
- Pixel art: [Kenney](https://kenney.nl) and Tiny Creatures by Clint Bellanger (CC0) - added in milestone 3.
