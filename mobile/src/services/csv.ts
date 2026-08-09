import { getCategory } from '../domain/categories';
import { minorToDecimal } from '../domain/money';
import type { Ledger, Transaction } from '../domain/types';
import { validateLedger } from '../data/validation';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function safeSpreadsheetText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  const safe = safeSpreadsheetText(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  suppliedLedger: Ledger,
): string {
  const ledger = validateLedger(suppliedLedger);
  const rows = [`Date,Type,Category,Description,Amount ${ledger.currencyCode},Recurring`];
  for (const transaction of transactions) {
    const category = getCategory(transaction.categoryId);
    rows.push([
      transaction.occurredOn,
      transaction.kind === 'income' ? 'Income' : 'Expense',
      category?.label ?? transaction.categoryId,
      transaction.description,
      minorToDecimal(transaction.amountMinor, ledger.currencyMinorUnit),
      transaction.isRecurring ? 'Yes' : 'No',
    ].map((value) => csvCell(value)).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
