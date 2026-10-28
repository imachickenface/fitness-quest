import { describe, expect, it } from 'vitest';
import { usernameProblem } from './username.ts';

describe('usernameProblem', () => {
  it('accepts 3-20 letters, numbers and _', () => {
    for (const ok of ['sam', 'Sam_99', 'a_b', '12345678901234567890', '___']) {
      expect(usernameProblem(ok), ok).toBeUndefined();
    }
  });

  it('says what to fix', () => {
    expect(usernameProblem('')).toBe('Use at least 3 characters.');
    expect(usernameProblem('ab')).toBe('Use at least 3 characters.');
    expect(usernameProblem('a'.repeat(21))).toBe('Use at most 20 characters.');
    for (const bad of ['sam smith', 'sam-smith', 'sam.s', 'sám', 'sam!', ' sam', 'ѕam']) {
      expect(usernameProblem(bad), bad).toBe('Use only letters, numbers and _.');
    }
  });
});
