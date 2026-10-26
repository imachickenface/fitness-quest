import { createOffClient } from '../core/off.ts';

/** One shared client so the 4 s spacing between Open Food Facts requests holds app-wide. */
export const offClient = createOffClient({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
