import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { skyAt, weatherOn } from './sky.ts';

const at = (h: number, m = 0) => new Date(2026, 10, 7, h, m);

describe('skyAt', () => {
  it('uses the phone clock: morning 5-8, day 8-17, dusk 17-20, night otherwise', () => {
    expect(skyAt(at(0))).toBe('night');
    expect(skyAt(at(4, 59))).toBe('night');
    expect(skyAt(at(5))).toBe('morning');
    expect(skyAt(at(7, 59))).toBe('morning');
    expect(skyAt(at(8))).toBe('day');
    expect(skyAt(at(16, 59))).toBe('day');
    expect(skyAt(at(17))).toBe('dusk');
    expect(skyAt(at(19, 59))).toBe('dusk');
    expect(skyAt(at(20))).toBe('night');
    expect(skyAt(at(23, 59))).toBe('night');
  });
});

describe('weatherOn', () => {
  const days = Array.from({ length: 3 * 365 }, (_, i) => addDays('2026-01-01', i));
  const rainy = days.filter((d) => weatherOn(d) === 'rain');

  it('is the same for everyone on a date', () => {
    for (const d of days.slice(0, 60)) expect(weatherOn(d)).toBe(weatherOn(d));
  });

  it('rains on about one day in four', () => {
    const share = rainy.length / days.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
  });

  it('changes from day to day rather than in long runs', () => {
    let run = 0;
    let longest = 0;
    for (const d of days) {
      run = weatherOn(d) === 'rain' ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(6);
    // neighbouring dates are not tied together: rain after rain about as often as rain overall
    const pairs = days.slice(1).filter((_, i) => weatherOn(days[i]!) === 'rain');
    const after = pairs.filter((d) => weatherOn(d) === 'rain').length / pairs.length;
    expect(after).toBeGreaterThan(0.12);
    expect(after).toBeLessThan(0.38);
  });

  it('is clear for anything that is not a date', () => {
    expect(weatherOn('')).toBe('clear');
    expect(weatherOn('tomorrow')).toBe('clear');
    expect(weatherOn('2026-13-01')).toBe('clear');
  });
});
