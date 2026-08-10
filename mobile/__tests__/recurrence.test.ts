import {
  enumerateMaterializationMonths,
  resolveMonthlyDueDate,
  validateRecurringTemplateDraft,
} from '../src/domain/recurrence';

describe('recurring calendar rules', () => {
  it('clamps due days to the last real day of the month', () => {
    expect(resolveMonthlyDueDate('2027-02', 31)).toBe('2027-02-28');
    expect(resolveMonthlyDueDate('2028-02', 31)).toBe('2028-02-29');
    expect(resolveMonthlyDueDate('2026-04', 31)).toBe('2026-04-30');
  });

  it('uses a bounded previous/current/next-two-month window', () => {
    expect(enumerateMaterializationMonths('2026-08-07')).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('rejects impossible dates, invalid ranges, categories, and transport-unsafe text', () => {
    const valid = {
      id: '22222222-2222-4222-8222-222222222222',
      ledgerId: '11111111-1111-4111-8111-111111111111',
      description: 'Rent',
      categoryId: 'housing' as const,
      amountMinor: 250_000,
      dueDay: 1,
      startMonth: '2026-08',
      endMonth: null,
      enabled: true,
    };
    expect(validateRecurringTemplateDraft(valid)).toEqual(valid);
    expect(() => validateRecurringTemplateDraft({ ...valid, dueDay: 0 })).toThrow();
    expect(() => validateRecurringTemplateDraft({ ...valid, startMonth: '2026-13' })).toThrow();
    expect(() => validateRecurringTemplateDraft({ ...valid, endMonth: '2026-07' })).toThrow();
    expect(() => validateRecurringTemplateDraft({ ...valid, categoryId: 'salary' as never })).toThrow();
    expect(() => validateRecurringTemplateDraft({ ...valid, description: 'bad\u0000value' })).toThrow();
  });
});
