import type { CategoryId, ExpenseCategoryId } from './categories';

export type TransactionKind = 'income' | 'expense';

export type Transaction = Readonly<{
  id: string;
  kind: TransactionKind;
  amountCents: number;
  categoryId: CategoryId;
  description: string;
  occurredOn: string;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type TransactionDraft = Readonly<{
  kind: TransactionKind;
  amountCents: number;
  categoryId: CategoryId;
  description: string;
  occurredOn: string;
  isRecurring: boolean;
}>;

export type Budget = Readonly<{
  categoryId: ExpenseCategoryId;
  limitCents: number;
  updatedAt: string;
}>;

export type FinanceSnapshot = Readonly<{
  transactions: Transaction[];
  budgets: Budget[];
}>;

export type MonthSummary = Readonly<{
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  savingsRatePercent: number;
  transactionCount: number;
  expenseByCategory: Readonly<Record<string, number>>;
}>;

export type MonthlyPoint = Readonly<{
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}>;
