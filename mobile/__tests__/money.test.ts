import { MoneyRangeError } from '../src/domain/errors';
import {
  addMinorExact,
  formatMinor,
  minorToDecimal,
  parseMinorAmount,
} from '../src/domain/money';
import type { Ledger } from '../src/domain/types';

const ledger = (currencyMinorUnit: 0 | 1 | 2 | 3, currencyCode = 'USD'): Ledger => ({
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Personal',
  currencyCode,
  currencyMinorUnit,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

describe('exact minor-unit money', () => {
  test.each([
    ['1', 0, 1],
    ['12.3', 1, 123],
    ['12.34', 2, 1_234],
    ['12.345', 3, 12_345],
    ['1,234.56', 2, 123_456],
  ] as const)('parses %s with minor unit %s', (input, unit, minor) => {
    expect(parseMinorAmount(input, unit)).toEqual({ ok: true, minor });
  });

  test.each([
    ['', 2], ['0', 2], ['0.00', 2], ['-1', 2], ['+1', 2],
    ['1.999', 2], ['1.0', 0], ['12,34.56', 2], ['1,23,456.78', 2],
    ['1e3', 2], ['NaN', 2], ['$12', 2], ['90071992547410.00', 2],
  ] as const)('rejects malformed or out-of-range %s', (input, unit) => {
    expect(parseMinorAmount(input, unit).ok).toBe(false);
  });

  it('formats the maximum safe USD value without losing its final cent', () => {
    expect(formatMinor(Number.MAX_SAFE_INTEGER, ledger(2), 'en-US'))
      .toBe('$90,071,992,547,409.91');
    expect(minorToDecimal(Number.MAX_SAFE_INTEGER, 2)).toBe('90071992547409.91');
  });

  it('preserves a negative sub-unit sign and locale currency placement', () => {
    expect(formatMinor(-1, ledger(2), 'en-US')).toBe('-$0.01');
    expect(formatMinor(1234, ledger(2, 'EUR'), 'de-DE')).toContain('€');
  });

  it('localizes the fractional digits that it inserts exactly', () => {
    const formatted = formatMinor(1234, ledger(2), 'ar-EG');
    expect(formatted).toMatch(/[\u0660-\u0669]/u);
    expect(formatted).not.toContain('34');
  });

  it('supports strict ISO currencies and minor units zero through three', () => {
    expect(formatMinor(9, ledger(0), 'en-US')).toBe('$9');
    expect(formatMinor(9, ledger(1), 'en-US')).toBe('$0.9');
    expect(formatMinor(9, ledger(2), 'en-US')).toBe('$0.09');
    expect(formatMinor(9, ledger(3), 'en-US')).toBe('$0.009');
    expect(() => formatMinor(1, ledger(2, 'usd'), 'en-US')).toThrow(MoneyRangeError);
  });

  it('rejects unsafe exact additions instead of silently rounding summaries', () => {
    expect(() => addMinorExact([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyRangeError);
    expect(addMinorExact([Number.MAX_SAFE_INTEGER, -1])).toBe(Number.MAX_SAFE_INTEGER - 1);
  });
});
