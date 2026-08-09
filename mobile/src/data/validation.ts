import { isCategoryForKind, isExpenseCategory } from '../domain/categories';
import { DataBoundaryError, LedgerCapacityError } from '../domain/errors';
import type {
  Budget,
  CurrencyMinorUnit,
  FinanceSnapshot,
  Ledger,
  Transaction,
  TransactionDraft,
} from '../domain/types';

export const MAX_LEDGER_TRANSACTIONS = 100_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function isValidDateKey(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isCanonicalUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

export function isValidTransactionId(value: string): boolean {
  if (isCanonicalUuid(value)) return true;
  if (hasUnpairedSurrogate(value)) return false;
  const characters = Array.from(value);
  return characters.length >= 1
    && characters.length <= 100
    && value.trim() === value
    && !/[\p{Cc}\p{Cf}/\\?#]/u.test(value);
}

function assertSafeMinor(value: number, label: string, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`Invalid ${label} amount.`);
  }
}

function validateMinorUnit(value: number): value is CurrencyMinorUnit {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

export function validateLedger(ledger: Ledger): Ledger {
  if (!isCanonicalUuid(ledger.id)
    || Array.from(ledger.name).length < 1
    || Array.from(ledger.name).length > 60
    || hasUnpairedSurrogate(ledger.name)
    || !/^[A-Z]{3}$/.test(ledger.currencyCode)
    || !validateMinorUnit(ledger.currencyMinorUnit)
    || !isValidIsoTimestamp(ledger.createdAt)
    || !isValidIsoTimestamp(ledger.updatedAt)) {
    throw new DataBoundaryError();
  }
  return { ...ledger };
}

export function validateDraft(draft: TransactionDraft): TransactionDraft {
  assertSafeMinor(draft.amountMinor, 'transaction');
  if (!isCategoryForKind(draft.categoryId, draft.kind)) {
    throw new Error('Invalid category for transaction kind.');
  }
  const description = draft.description.trim();
  const descriptionLength = Array.from(description).length;
  if (descriptionLength < 1 || descriptionLength > 120 || hasUnpairedSurrogate(description) || /\u0000/u.test(description)) {
    throw new Error('Transaction description must contain 1 to 120 supported characters.');
  }
  if (!isValidDateKey(draft.occurredOn)) throw new Error('Invalid transaction date.');
  return { ...draft, description };
}

export function validateTransaction(transaction: Transaction): Transaction {
  if (!isValidTransactionId(transaction.id)) throw new Error('Invalid transaction identifier.');
  const draft = validateDraft(transaction);
  if (!isValidIsoTimestamp(transaction.createdAt) || !isValidIsoTimestamp(transaction.updatedAt)) {
    throw new Error('Invalid transaction timestamp.');
  }
  return { ...transaction, ...draft };
}

export function validateBudget(budget: Budget): Budget {
  if (!isExpenseCategory(budget.categoryId)) throw new Error('Invalid expense category.');
  assertSafeMinor(budget.limitMinor, 'budget');
  if (!isValidIsoTimestamp(budget.updatedAt)) throw new Error('Invalid budget timestamp.');
  return { ...budget };
}

export function validateSnapshot(snapshot: FinanceSnapshot): FinanceSnapshot {
  if (snapshot.transactions.length > MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
  const transactionIds = new Set<string>();
  const transactions = snapshot.transactions.map((transaction) => {
    const validated = validateTransaction(transaction);
    if (transactionIds.has(validated.id)) throw new Error('Duplicate transaction identifier.');
    transactionIds.add(validated.id);
    return validated;
  });
  const budgetIds = new Set<string>();
  const budgets = snapshot.budgets.map((budget) => {
    const validated = validateBudget(budget);
    if (budgetIds.has(validated.categoryId)) throw new Error('Duplicate budget category.');
    budgetIds.add(validated.categoryId);
    return validated;
  });
  return { transactions, budgets };
}

export function validateBudgetAmount(categoryId: string, limitMinor: number): void {
  if (!isExpenseCategory(categoryId)) throw new Error('Invalid expense category.');
  assertSafeMinor(limitMinor, 'budget', true);
}

export function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn)
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id));
}
