/** The sky for a moment on the phone's clock: morning 5-8, day 8-17, dusk 17-20, night otherwise. */
import type { Sky } from './engine.ts';

export function skyAt(now: Date): Sky {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 5 && h < 8) return 'morning';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}
