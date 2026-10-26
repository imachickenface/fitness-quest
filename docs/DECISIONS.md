# Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-10-26 | Android PWA, not a native app | Owner uses Android; a PWA needs no store, installs from a URL, and Chrome Android has a native barcode API. Cost: no Health Connect access (native SDK only). |
| 2026-10-26 | Data only on the phone (IndexedDB) + backup file | One user, free, private, works offline. Risk of loss handled by `storage.persist()` and backup reminders. |
| 2026-10-26 | Calories: recents/favourites + offline USDA search + Open Food Facts barcode + quick-add | Fastest free pattern; photo estimates are paid and least accurate; natural language needs the PC on. |
| 2026-10-26 | Bundle a trimmed USDA list instead of calling the USDA API | The API key would be public in a web app; offline search is faster and has no rate limit. |
| 2026-10-26 | Game state derived from records, never stored | Rule changes recompute cleanly; every rule unit-testable; save data can't be corrupted by game bugs. |
| 2026-10-26 | Own small Canvas renderer, not Phaser | One map and one walking sprite don't justify a game engine's size. |
| 2026-10-26 | Programs generated from rules, not copied plans | Published plans are copyrighted; principles aren't. |
| 2026-10-26 | Public GitHub repo + GitHub Pages (owner's choice, after first picking private) | Free Pages hosting needs a public repo; nothing personal is in the code. |
| 2026-10-26 | No taste-skill, no Lenis | Personal app screens with a pixel-art direction set by CC0 packs; short screens don't need smooth scroll. |
| 2026-10-26 | M1 Qwen results: targets, diary, db, build-foods accepted after review; food search written by Claude | Qwen failed food search twice (changed no files), so the two-attempt rule handed it back. Review fixes: `listWeighIns` ignored a one-sided range; the builder kept nutrients for foods it then dropped. |
| 2026-10-26 | Self-host Pixelify Sans via `@fontsource-variable/pixelify-sans` | Works offline in the PWA and sends no request to Google Fonts. |
| 2026-10-26 | `foods.json`: 7,687 foods, 956 KB raw / 197 KB gzipped, precached (Workbox limit raised to 4 MB) | Search works offline from the first launch. |
