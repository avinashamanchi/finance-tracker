import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { ExpenseCategoryId } from '../domain/categories';
import type { Budget, FinanceSnapshot, Transaction, TransactionDraft } from '../domain/types';
import { CREATE_SCHEMA_SQL } from './schema';
import {
  validateBudget,
  validateBudgetAmount,
  validateDraft,
  validateSnapshot,
  validateTransaction,
} from './validation';

export interface FinanceRepository {
  initialize(): Promise<void>;
  listTransactions(): Promise<Transaction[]>;
  createTransaction(draft: TransactionDraft): Promise<Transaction>;
  updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  listBudgets(): Promise<Budget[]>;
  setBudget(categoryId: ExpenseCategoryId, limitCents: number): Promise<Budget | undefined>;
  snapshot(): Promise<FinanceSnapshot>;
  replaceAll(snapshot: FinanceSnapshot): Promise<void>;
  deleteAll(): Promise<void>;
}

type TransactionRow = {
  id: string;
  kind: 'income' | 'expense';
  amount_cents: number;
  category_id: Transaction['categoryId'];
  description: string;
  occurred_on: string;
  is_recurring: number;
  created_at: string;
  updated_at: string;
};

type BudgetRow = { category_id: ExpenseCategoryId; limit_cents: number; updated_at: string };

function mapTransaction(row: TransactionRow): Transaction {
  return validateTransaction({
    id: row.id,
    kind: row.kind,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    description: row.description,
    occurredOn: row.occurred_on,
    isRecurring: row.is_recurring === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapBudget(row: BudgetRow): Budget {
  return validateBudget({
    categoryId: row.category_id,
    limitCents: row.limit_cents,
    updatedAt: row.updated_at,
  });
}

export class SQLiteFinanceRepository implements FinanceRepository {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  async initialize(): Promise<void> {
    await this.database.execAsync(CREATE_SCHEMA_SQL);
  }

  async listTransactions(): Promise<Transaction[]> {
    const rows = await this.database.getAllAsync<TransactionRow>(
      'SELECT * FROM transactions ORDER BY occurred_on DESC, created_at DESC, id DESC',
    );
    return rows.map(mapTransaction);
  }

  async createTransaction(draft: TransactionDraft): Promise<Transaction> {
    const valid = validateDraft(draft);
    const now = new Date().toISOString();
    const transaction: Transaction = {
      ...valid,
      id: Crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.insertTransaction(transaction);
    return transaction;
  }

  async updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction> {
    const valid = validateDraft(draft);
    const existing = await this.database.getFirstAsync<TransactionRow>(
      'SELECT * FROM transactions WHERE id = ?', id,
    );
    if (!existing) throw new Error('Transaction not found.');
    const transaction: Transaction = {
      ...mapTransaction(existing),
      ...valid,
      updatedAt: new Date().toISOString(),
    };
    await this.database.runAsync(
      `UPDATE transactions SET kind = ?, amount_cents = ?, category_id = ?, description = ?,
       occurred_on = ?, is_recurring = ?, updated_at = ? WHERE id = ?`,
      transaction.kind,
      transaction.amountCents,
      transaction.categoryId,
      transaction.description,
      transaction.occurredOn,
      transaction.isRecurring ? 1 : 0,
      transaction.updatedAt,
      transaction.id,
    );
    return transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM transactions WHERE id = ?', id);
  }

  async listBudgets(): Promise<Budget[]> {
    const rows = await this.database.getAllAsync<BudgetRow>('SELECT * FROM budgets ORDER BY category_id');
    return rows.map(mapBudget);
  }

  async setBudget(categoryId: ExpenseCategoryId, limitCents: number): Promise<Budget | undefined> {
    validateBudgetAmount(categoryId, limitCents);
    if (limitCents === 0) {
      await this.database.runAsync('DELETE FROM budgets WHERE category_id = ?', categoryId);
      return undefined;
    }
    const budget: Budget = { categoryId, limitCents, updatedAt: new Date().toISOString() };
    await this.database.runAsync(
      `INSERT INTO budgets (category_id, limit_cents, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(category_id) DO UPDATE SET limit_cents = excluded.limit_cents,
       updated_at = excluded.updated_at`,
      budget.categoryId, budget.limitCents, budget.updatedAt,
    );
    return budget;
  }

  async snapshot(): Promise<FinanceSnapshot> {
    const [transactions, budgets] = await Promise.all([this.listTransactions(), this.listBudgets()]);
    return { transactions, budgets };
  }

  async replaceAll(snapshot: FinanceSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot);
    await this.database.withTransactionAsync(async () => {
      await this.database.runAsync('DELETE FROM transactions');
      await this.database.runAsync('DELETE FROM budgets');
      for (const transaction of valid.transactions) await this.insertTransaction(transaction);
      for (const budget of valid.budgets) {
        await this.database.runAsync(
          'INSERT INTO budgets (category_id, limit_cents, updated_at) VALUES (?, ?, ?)',
          budget.categoryId, budget.limitCents, budget.updatedAt,
        );
      }
    });
  }

  async deleteAll(): Promise<void> {
    await this.database.withTransactionAsync(async () => {
      await this.database.runAsync('DELETE FROM transactions');
      await this.database.runAsync('DELETE FROM budgets');
    });
  }

  private async insertTransaction(transaction: Transaction): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO transactions
       (id, kind, amount_cents, category_id, description, occurred_on, is_recurring, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      transaction.id,
      transaction.kind,
      transaction.amountCents,
      transaction.categoryId,
      transaction.description,
      transaction.occurredOn,
      transaction.isRecurring ? 1 : 0,
      transaction.createdAt,
      transaction.updatedAt,
    );
  }
}

export async function openFinanceRepository(): Promise<SQLiteFinanceRepository> {
  const database = await SQLite.openDatabaseAsync('finova.db');
  const repository = new SQLiteFinanceRepository(database);
  await repository.initialize();
  return repository;
}
