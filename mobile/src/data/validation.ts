import { isCategoryForKind, isExpenseCategory } from '../domain/categories';
import type { Budget, FinanceSnapshot, Transaction, TransactionDraft } from '../domain/types';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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

function assertSafeCents(value: number, label: string, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`Invalid ${label} amount.`);
  }
}

export function validateDraft(draft: TransactionDraft): TransactionDraft {
  assertSafeCents(draft.amountCents, 'transaction');
  if (!isCategoryForKind(draft.categoryId, draft.kind)) {
    throw new Error('Invalid category for transaction kind.');
  }
  const description = draft.description.trim();
  const descriptionLength = Array.from(description).length;
  if (descriptionLength < 1 || descriptionLength > 120) {
    throw new Error('Transaction description must contain 1 to 120 characters.');
  }
  if (!isValidDateKey(draft.occurredOn)) {
    throw new Error('Invalid transaction date.');
  }
  return { ...draft, description };
}

export function validateTransaction(transaction: Transaction): Transaction {
  if (!transaction.id || Array.from(transaction.id).length > 100) {
    throw new Error('Invalid transaction identifier.');
  }
  const draft = validateDraft(transaction);
  if (Number.isNaN(Date.parse(transaction.createdAt)) || Number.isNaN(Date.parse(transaction.updatedAt))) {
    throw new Error('Invalid transaction timestamp.');
  }
  return { ...transaction, ...draft };
}

export function validateBudget(budget: Budget): Budget {
  if (!isExpenseCategory(budget.categoryId)) {
    throw new Error('Invalid expense category.');
  }
  assertSafeCents(budget.limitCents, 'budget');
  if (Number.isNaN(Date.parse(budget.updatedAt))) {
    throw new Error('Invalid budget timestamp.');
  }
  return { ...budget };
}

export function validateSnapshot(snapshot: FinanceSnapshot): FinanceSnapshot {
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

export function validateBudgetAmount(categoryId: string, limitCents: number): void {
  if (!isExpenseCategory(categoryId)) throw new Error('Invalid expense category.');
  assertSafeCents(limitCents, 'budget', true);
}

export function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn)
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id));
}
