/** The scene's sky and weather: the time of day from the phone's clock, and one weather a day for everyone. */

export type Sky = 'morning' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain';

/** The sky for a moment on the phone's clock: morning 5-8, day 8-17, dusk 17-20, night otherwise. */
export function skyAt(now: Date): Sky {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 5 && h < 8) return 'morning';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The weather on a calendar day (`YYYY-MM-DD`): rain on about one day in four, the same on every phone that day.
 * A hash of the date picks it, so nothing is fetched and nothing is stored.
 */
export function weatherOn(date: string): Weather {
  const m = DATE.exec(date);
  if (!m) return 'clear';
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return 'clear';
  // FNV-1a over the date, then a murmur3 finish so neighbouring dates land far apart
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 4 === 0 ? 'rain' : 'clear';
}
