import { getCategory } from '../domain/categories';
import type { Transaction } from '../domain/types';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function safeSpreadsheetText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  const safe = safeSpreadsheetText(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const rows = ['Date,Type,Category,Description,Amount USD,Recurring'];
  for (const transaction of transactions) {
    const category = getCategory(transaction.categoryId);
    rows.push([
      transaction.occurredOn,
      transaction.kind === 'income' ? 'Income' : 'Expense',
      category?.label ?? transaction.categoryId,
      transaction.description,
      (transaction.amountCents / 100).toFixed(2),
      transaction.isRecurring ? 'Yes' : 'No',
    ].map((value) => csvCell(value)).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
