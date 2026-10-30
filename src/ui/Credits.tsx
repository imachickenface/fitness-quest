const CREDITS: { name: string; url: string; what: string; licence: string }[] = [
  {
    name: 'Open Food Facts',
    url: 'https://world.openfoodfacts.org',
    what: 'barcode and food search data, by its contributors',
    licence: 'ODbL',
  },
  {
    name: 'USDA FoodData Central',
    url: 'https://fdc.nal.usda.gov',
    what: 'the built-in food list',
    licence: 'CC0',
  },
  {
    name: 'free-exercise-db',
    url: 'https://github.com/yuhonas/free-exercise-db',
    what: 'the exercise library and how-to steps',
    licence: 'public domain',
  },
  {
    name: 'Kenney Mini Characters',
    url: 'https://kenney.nl/assets/mini-characters',
    what: 'the hero models',
    licence: 'CC0',
  },
  {
    name: 'Badge art',
    url: 'https://github.com/imachickenface/fitness-quest/tree/main/public/badges',
    what: 'the 20 badges, supplied by the app’s owner',
    licence: 'used with the owner’s permission',
  },
  {
    name: 'Mash Elite Relative Intensity chart',
    url: 'https://www.mashelite.com',
    what: 'the RIR, RPE and %1RM numbers behind effort and the next weights, supplied by the app’s owner',
    licence: 'figures used as a training reference',
  },
  {
    name: 'Nunito and Pixelify Sans',
    url: 'https://fonts.google.com',
    what: 'the fonts',
    licence: 'SIL Open Font License',
  },
  {
    name: 'three.js, React, Dexie, zod, zxing-wasm, supabase-js, uqr',
    url: 'https://github.com/imachickenface/fitness-quest/blob/main/package.json',
    what: 'the code libraries',
    licence: 'MIT and Apache 2.0',
  },
];

/** Where the data, art and fonts come from. */
export function Credits() {
  return (
    <details className="credits">
      <summary>Credits</summary>
      <ul>
        {CREDITS.map((c) => (
          <li key={c.name}>
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.name}
            </a>
            : {c.what} ({c.licence})
          </li>
        ))}
      </ul>
    </details>
  );
}
