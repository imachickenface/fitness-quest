import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';

describe('addDays', () => {
  it('moves calendar dates across months, years and DST changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // EU clocks go forward 03-29
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // and back 10-25
    expect(addDays('2026-11-01', 7)).toBe('2026-11-08'); // US change
  });
});
