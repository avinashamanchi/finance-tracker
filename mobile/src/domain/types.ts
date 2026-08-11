import type { CategoryId, ExpenseCategoryId } from './categories';

export type CurrencyMinorUnit = 0 | 1 | 2 | 3;

export type Ledger = Readonly<{
  id: string;
  name: string;
  currencyCode: string;
  currencyMinorUnit: CurrencyMinorUnit;
  createdAt: string;
  updatedAt: string;
}>;

export type TransactionKind = 'income' | 'expense';

export type Transaction = Readonly<{
  id: string;
  kind: TransactionKind;
  amountMinor: number;
  categoryId: CategoryId;
  description: string;
  occurredOn: string;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type TransactionDraft = Readonly<{
  kind: TransactionKind;
  amountMinor: number;
  categoryId: CategoryId;
  description: string;
  occurredOn: string;
  isRecurring: boolean;
}>;

export type Budget = Readonly<{
  categoryId: ExpenseCategoryId;
  limitMinor: number;
  updatedAt: string;
}>;

export type FinanceSnapshot = Readonly<{
  transactions: Transaction[];
  budgets: Budget[];
}>;

export type MonthSummary = Readonly<{
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
  savingsRatePercent: number;
  transactionCount: number;
  expenseByCategory: Readonly<Record<string, number>>;
}>;

export type MonthlyPoint = Readonly<{
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
}>;

export type BudgetUsage = Readonly<{
  month: string;
  budgets: readonly Budget[];
  expenseByCategory: Readonly<Record<string, number>>;
  totalLimitMinor: number;
}>;
