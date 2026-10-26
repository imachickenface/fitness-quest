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
| 2026-10-26 | Open Food Facts client written by Claude | Qwen stopped twice without writing a file (read the inputs, then ended). Same failure as M1 food search: worth checking the worker before the next big hand-off. |
| 2026-10-26 | Barcode fallback decoder bundled with the app (`zxing-wasm` 3.1.6 `?url`), cached on first use, not precached | The library's default downloads it from a CDN. Chrome on Android uses its native detector, so most phones never fetch the 946 KB file. |
| 2026-10-26 | Custom foods from a label are stored per 100 g and saved as favourites; "per serving" input is converted | One stored shape for search and logging; favourites put them in quick log. |
| 2026-10-26 | Custom calorie and macro targets in the profile; all three macros alone set the calories | Owner's request. One rule keeps calories and macros consistent; the calorie target wins if both are set (the form says so). |
| 2026-10-26 | Accounts / sync parked as M7, research first | Needs a server and changes "data only on the phone"; security-sensitive, so Claude-only with a security review. |
| 2026-10-26 | Qwen worker: reply limit 4096 -> 12288 tokens, cut-off replies get a "write it now" nudge | M1/M2 failures were replies cut off mid-write after ~3.5k tokens of thinking. After the fix all three M3 core tasks passed on the first attempt. |
| 2026-10-26 | Game rules: food 2 XP (5/day), workout 20 XP (2/day), weigh-in 5 XP; level L costs 50(L+1); any log keeps the streak; a freeze per 7 active days, max 2 | Rewards showing up, not eating or training more; numbers small enough that quests matter. |
| 2026-10-26 | Daily quests are generated on first open of the day from the 14 days before, then stored | A day's quests never shift; targets follow the user's own habits. |
