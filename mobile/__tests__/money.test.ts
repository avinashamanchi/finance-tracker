import { formatCents, parseAmountToCents } from '../src/domain/money';

describe('money', () => {
  test.each([
    ['0.01', 1],
    ['12', 1200],
    ['12.3', 1230],
    ['12.34', 1234],
    ['1,234.56', 123456],
  ])('parses %s as integer cents', (input, cents) => {
    expect(parseAmountToCents(input)).toEqual({ ok: true, cents });
  });

  test.each(['', '0', '0.00', '-1', '+1', '1.999', '1e3', 'NaN', '$12'])('rejects %s', (input) => {
    expect(parseAmountToCents(input).ok).toBe(false);
  });

  it('rejects values outside safe integer cents', () => {
    expect(parseAmountToCents('90071992547410.00').ok).toBe(false);
  });

  it('formats signed cents without changing stored precision', () => {
    expect(formatCents(1234)).toBe('$12.34');
    expect(formatCents(-1234)).toBe('-$12.34');
  });
});
