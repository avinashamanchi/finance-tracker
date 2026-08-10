import { getCategory } from '../domain/categories';
import { minorToDecimal } from '../domain/money';
import type { Ledger, Transaction } from '../domain/types';
import { validateLedger, validateTransaction } from '../data/validation';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function safeSpreadsheetText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function csvCell(value: string): string {
  const safe = safeSpreadsheetText(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function transactionCsvHeader(suppliedLedger: Ledger): string {
  const ledger = validateLedger(suppliedLedger);
  return `Date,Type,Category,Description,Amount ${ledger.currencyCode},Recurring\r\n`;
}

export function transactionToCsvRow(
  suppliedTransaction: Transaction,
  suppliedLedger: Ledger,
): string {
  const ledger = validateLedger(suppliedLedger);
  const transaction = validateTransaction(suppliedTransaction);
  const category = getCategory(transaction.categoryId);
  return `${[
    transaction.occurredOn,
    transaction.kind === 'income' ? 'Income' : 'Expense',
    category?.label ?? transaction.categoryId,
    transaction.description,
    minorToDecimal(transaction.amountMinor, ledger.currencyMinorUnit),
    transaction.isRecurring ? 'Yes' : 'No',
  ].map((value) => csvCell(value)).join(',')}\r\n`;
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  suppliedLedger: Ledger,
): string {
  const ledger = validateLedger(suppliedLedger);
  const rows = [transactionCsvHeader(ledger)];
  for (const transaction of transactions) {
    rows.push(transactionToCsvRow(transaction, ledger));
  }
  return rows.join('');
}
