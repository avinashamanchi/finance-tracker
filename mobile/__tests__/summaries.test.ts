import type { Transaction } from '../src/domain/types';
import { buildSixMonthTrend, summarizeMonth } from '../src/domain/summaries';

const transaction = (partial: Partial<Transaction>): Transaction => ({
  id: partial.id ?? 'id',
  kind: partial.kind ?? 'expense',
  amountCents: partial.amountCents ?? 100,
  categoryId: partial.categoryId ?? 'groceries',
  description: partial.description ?? 'Fixture',
  occurredOn: partial.occurredOn ?? '2026-08-01',
  isRecurring: partial.isRecurring ?? false,
  createdAt: partial.createdAt ?? '2026-08-01T00:00:00.000Z',
  updatedAt: partial.updatedAt ?? '2026-08-01T00:00:00.000Z',
});

describe('summaries', () => {
  const fixtures = [
    transaction({ id: 'income', kind: 'income', amountCents: 10_000 }),
    transaction({ id: 'expense', amountCents: 5_750 }),
    transaction({ id: 'other-month', amountCents: 999, occurredOn: '2026-07-31' }),
  ];

  it('summarizes only the selected calendar month', () => {
    expect(summarizeMonth(fixtures, '2026-08')).toMatchObject({
      incomeCents: 10_000,
      expenseCents: 5_750,
      balanceCents: 4_250,
      savingsRatePercent: 42.5,
      transactionCount: 2,
    });
  });

  it('returns a stable six-month series including empty months', () => {
    const trend = buildSixMonthTrend(fixtures, '2026-08');
    expect(trend).toHaveLength(6);
    expect(trend.map((point) => point.month)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ]);
    expect(trend.at(-1)?.balanceCents).toBe(4_250);
  });

  it('rejects invalid month keys instead of guessing', () => {
    expect(() => summarizeMonth(fixtures, '2026-13')).toThrow('month');
  });
});
