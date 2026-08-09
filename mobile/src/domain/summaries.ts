import { addMinorExact, exactPercent } from './money';
import type { MonthSummary, MonthlyPoint, Transaction } from './types';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function assertMonth(month: string): void {
  if (!MONTH_PATTERN.test(month)) throw new Error('Invalid month key.');
}

export function currentMonth(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function shiftMonth(month: string, offset: number): string {
  assertMonth(month);
  if (!Number.isSafeInteger(offset)) throw new Error('Invalid month offset.');
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function summarizeMonth(transactions: readonly Transaction[], month: string): MonthSummary {
  assertMonth(month);
  const selected = transactions.filter((transaction) => transaction.occurredOn.startsWith(`${month}-`));
  const income = selected.filter((item) => item.kind === 'income').map((item) => item.amountMinor);
  const expenses = selected.filter((item) => item.kind === 'expense');
  const incomeMinor = addMinorExact(income);
  const expenseMinor = addMinorExact(expenses.map((item) => item.amountMinor));
  const expenseByCategory: Record<string, number[]> = {};
  for (const transaction of expenses) {
    (expenseByCategory[transaction.categoryId] ??= []).push(transaction.amountMinor);
  }
  return {
    month,
    incomeMinor,
    expenseMinor,
    balanceMinor: addMinorExact([incomeMinor, -expenseMinor]),
    savingsRatePercent: exactPercent(incomeMinor - expenseMinor, incomeMinor),
    transactionCount: selected.length,
    expenseByCategory: Object.fromEntries(
      Object.entries(expenseByCategory).map(([category, values]) => [category, addMinorExact(values)]),
    ),
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
      incomeMinor: summary.incomeMinor,
      expenseMinor: summary.expenseMinor,
      balanceMinor: summary.balanceMinor,
    };
  });
}
