import * as Crypto from 'expo-crypto';
import type { ExpenseCategoryId } from '../domain/categories';
import type { Budget, FinanceSnapshot, Transaction, TransactionDraft } from '../domain/types';
import type { FinanceRepository } from './financeRepository';
import {
  sortTransactions,
  validateBudgetAmount,
  validateDraft,
  validateSnapshot,
} from './validation';

type Options = Readonly<{
  now?: () => string;
  createId?: () => string;
}>;

let fallbackMemoryId = 0;

export class InMemoryFinanceRepository implements FinanceRepository {
  private transactions: Transaction[] = [];
  private budgets: Budget[] = [];
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: Options = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => Crypto.randomUUID?.() ?? `memory-${++fallbackMemoryId}`);
  }

  async initialize(): Promise<void> {}

  async listTransactions(): Promise<Transaction[]> {
    return sortTransactions(this.transactions).map((transaction) => ({ ...transaction }));
  }

  async createTransaction(draft: TransactionDraft): Promise<Transaction> {
    const valid = validateDraft(draft);
    const now = this.now();
    const transaction: Transaction = {
      ...valid,
      id: this.createId(),
      createdAt: now,
      updatedAt: now,
    };
    this.transactions = [transaction, ...this.transactions];
    return { ...transaction };
  }

  async updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction> {
    const index = this.transactions.findIndex((transaction) => transaction.id === id);
    if (index < 0) throw new Error('Transaction not found.');
    const valid = validateDraft(draft);
    const transaction: Transaction = {
      ...this.transactions[index],
      ...valid,
      updatedAt: this.now(),
    };
    this.transactions = this.transactions.map((item) => item.id === id ? transaction : item);
    return { ...transaction };
  }

  async deleteTransaction(id: string): Promise<void> {
    this.transactions = this.transactions.filter((transaction) => transaction.id !== id);
  }

  async listBudgets(): Promise<Budget[]> {
    return [...this.budgets]
      .sort((left, right) => left.categoryId.localeCompare(right.categoryId))
      .map((budget) => ({ ...budget }));
  }

  async setBudget(categoryId: ExpenseCategoryId, limitCents: number): Promise<Budget | undefined> {
    validateBudgetAmount(categoryId, limitCents);
    this.budgets = this.budgets.filter((budget) => budget.categoryId !== categoryId);
    if (limitCents === 0) return undefined;
    const budget: Budget = { categoryId, limitCents, updatedAt: this.now() };
    this.budgets.push(budget);
    return { ...budget };
  }

  async snapshot(): Promise<FinanceSnapshot> {
    return { transactions: await this.listTransactions(), budgets: await this.listBudgets() };
  }

  async replaceAll(snapshot: FinanceSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot);
    this.transactions = valid.transactions.map((transaction) => ({ ...transaction }));
    this.budgets = valid.budgets.map((budget) => ({ ...budget }));
  }

  async deleteAll(): Promise<void> {
    this.transactions = [];
    this.budgets = [];
  }
}
