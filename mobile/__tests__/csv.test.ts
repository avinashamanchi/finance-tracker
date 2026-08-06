import { transactionsToCsv } from '../src/services/csv';
import type { Transaction } from '../src/domain/types';

const create = (description: string): Transaction => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'expense',
  amountCents: 1_250,
  categoryId: 'dining',
  description,
  occurredOn: '2026-08-06',
  isRecurring: false,
  createdAt: '2026-08-06T12:00:00.000Z',
  updatedAt: '2026-08-06T12:00:00.000Z',
});

describe('CSV export', () => {
  it('uses a stable header and exact decimal amount', () => {
    const csv = transactionsToCsv([create('Lunch')]);
    expect(csv.split('\r\n')[0]).toBe('Date,Type,Category,Description,Amount USD,Recurring');
    expect(csv).toContain('2026-08-06,Expense,Dining,Lunch,12.50,No');
  });

  it('quotes commas, quotes, and line breaks', () => {
    const csv = transactionsToCsv([create('Lunch, "team"\nFriday')]);
    expect(csv).toContain('"Lunch, ""team""\nFriday"');
  });

  it('neutralizes spreadsheet formula prefixes in user text', () => {
    expect(transactionsToCsv([create('=SUM(A1:A2)')])).toContain("'=SUM(A1:A2)");
    expect(transactionsToCsv([create('@malicious')])).toContain("'@malicious");
  });
});
