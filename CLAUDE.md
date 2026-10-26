# Fitness Quest

A personal, gamified fitness PWA for one user on an Android phone: fast calorie logging, workout logging, quests,
XP and a pixel-art overworld. Brief: `docs/PROJECT.md`. Plan and task owners: `docs/PLAN.md` (tick tasks there).
Research: `docs/RESEARCH.md`. Decisions: `docs/DECISIONS.md`.

## Stack

Vite 8, React 19, TypeScript 6.0 (not 7: typescript-eslint supports < 6.1), vite-plugin-pwa 2, zod 4, Vitest 5
(jsdom), Playwright 1.64 (Pixel 7 emulation). Planned: Dexie 4 (IndexedDB), GSAP 3 for game feedback,
`barcode-detector` polyfill. Node 24 portable at `C:\Users\super\node-portable\node-v24.22.1-win-x64` (add it to
PATH in shells).

## Commands

- `npm run dev` - dev server at http://localhost:5173/fitness-quest/
- `npm test` - unit tests (Vitest); `npm run test:e2e` - builds, serves and runs Playwright at phone size
- `npm run lint`, `npm run typecheck`, `npm run format` / `format:check`
- `npm run build` - type-check + production build into `dist/` (icons generated from `public/icon.svg`)

Every push to `main` runs all checks in GitHub Actions and deploys to
https://imachickenface.github.io/fitness-quest/ (public repo `imachickenface/fitness-quest`).

## Conventions

- `src/contract.ts` is the single source of data shapes (zod schemas, types inferred). Change a stored shape only
  with a `SCHEMA_VERSION` bump and a backup migration.
- `src/core/` is pure logic: no DOM, no React, no IndexedDB. Deterministic (pass `today`/`now` and seeds in,
  never read the clock inside). This is where Qwen tasks go; Claude writes the tests first.
- `src/db/` wraps Dexie; `src/ui/` is React (Claude's).
- Storage is metric (kg, m, s, kcal); the UI converts. Dates are local `YYYY-MM-DD` strings.
- Game state (XP, level, streak, quest completion) is derived from records, never stored.
- Tests reuse `src/test/fixtures.ts`. Never commit personal data (backups, real notes; anonymise fixtures).
- Open Food Facts calls send `X-User-Agent: FitnessQuest/<version> (github.com/imachickenface/fitness-quest)` and
  stay under 15 reads/min.
- Phone first: check 360 px and 412 px widths; no horizontal scroll; respect `prefers-reduced-motion`.
