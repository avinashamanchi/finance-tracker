import type { MonthSummary, MonthlyPoint, Transaction } from './types';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function assertMonth(month: string): void {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error('Invalid month key.');
  }
}

export function currentMonth(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function shiftMonth(month: string, offset: number): string {
  assertMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function summarizeMonth(transactions: readonly Transaction[], month: string): MonthSummary {
  assertMonth(month);
  let incomeCents = 0;
  let expenseCents = 0;
  const expenseByCategory: Record<string, number> = {};
  const selected = transactions.filter((transaction) => transaction.occurredOn.startsWith(`${month}-`));

  for (const transaction of selected) {
    if (transaction.kind === 'income') {
      incomeCents += transaction.amountCents;
    } else {
      expenseCents += transaction.amountCents;
      expenseByCategory[transaction.categoryId] =
        (expenseByCategory[transaction.categoryId] ?? 0) + transaction.amountCents;
    }
    if (!Number.isSafeInteger(incomeCents) || !Number.isSafeInteger(expenseCents)) {
      throw new Error('Monthly total exceeds the supported range.');
    }
  }

  const balanceCents = incomeCents - expenseCents;
  const savingsRatePercent = incomeCents === 0
    ? 0
    : Math.round((balanceCents / incomeCents) * 1_000) / 10;

  return {
    month,
    incomeCents,
    expenseCents,
    balanceCents,
    savingsRatePercent,
    transactionCount: selected.length,
    expenseByCategory,
  };
}

export function buildSixMonthTrend(
  transactions: readonly Transaction[],
  anchorMonth: string,
): MonthlyPoint[] {
  assertMonth(anchorMonth);
  return Array.from({ length: 6 }, (_, index) => shiftMonth(anchorMonth, index - 5)).map((month) => {
    const summary = summarizeMonth(transactions, month);
    return {
      month,
      incomeCents: summary.incomeCents,
      expenseCents: summary.expenseCents,
      balanceCents: summary.balanceCents,
    };
  });
}
