import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { ExpenseCategoryId } from '../domain/categories';
import type { Budget, FinanceSnapshot, Transaction, TransactionDraft } from '../domain/types';
import {
  createExpoMigrationDatabase,
  type ExpoMigrationDatabaseSource,
} from './configureConnection';
import { runMigrations } from './migrations';
import type { MigrationContext, MigrationDatabase } from './migrations/types';
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

type LedgerIdRow = { id: string };

function currentLocalMonth(now: Date): string {
  return `${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

function createMigrationContext(): MigrationContext {
  const now = new Date();
  return {
    legacyLedgerId: Crypto.randomUUID(),
    currentMonth: currentLocalMonth(now),
    nowIso: now.toISOString(),
  };
}

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
  private readonly migrationDatabase: MigrationDatabase;
  private ledgerId: string | null = null;

  constructor(
    private readonly database: SQLite.SQLiteDatabase,
    private readonly migrationContext: MigrationContext = createMigrationContext(),
  ) {
    this.migrationDatabase = createExpoMigrationDatabase(
      database as unknown as ExpoMigrationDatabaseSource,
    );
  }

  async initialize(): Promise<void> {
    await runMigrations(this.migrationDatabase, this.migrationContext);
    const ledger = await this.database.getFirstAsync<LedgerIdRow>(
      'SELECT id FROM ledgers ORDER BY rowid LIMIT 1',
    );
    if (!ledger) throw new Error('Finova ledger could not be initialized.');
    this.ledgerId = ledger.id;
  }

  async listTransactions(): Promise<Transaction[]> {
    const rows = await this.database.getAllAsync<TransactionRow>(
      `SELECT id, kind, amount_minor AS amount_cents, category_id, description, occurred_on,
              legacy_recurring AS is_recurring, created_at, updated_at
       FROM transactions WHERE ledger_id = ?
       ORDER BY occurred_on DESC, created_at DESC, id DESC`,
      this.requireLedgerId(),
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
      `SELECT id, kind, amount_minor AS amount_cents, category_id, description, occurred_on,
              legacy_recurring AS is_recurring, created_at, updated_at
       FROM transactions WHERE id = ? AND ledger_id = ?`,
      id,
      this.requireLedgerId(),
    );
    if (!existing) throw new Error('Transaction not found.');
    const transaction: Transaction = {
      ...mapTransaction(existing),
      ...valid,
      updatedAt: new Date().toISOString(),
    };
    await this.database.runAsync(
      `UPDATE transactions SET kind = ?, amount_minor = ?, category_id = ?, description = ?,
       occurred_on = ?, legacy_recurring = ?, updated_at = ? WHERE id = ? AND ledger_id = ?`,
      transaction.kind,
      transaction.amountCents,
      transaction.categoryId,
      transaction.description,
      transaction.occurredOn,
      transaction.isRecurring ? 1 : 0,
      transaction.updatedAt,
      transaction.id,
      this.requireLedgerId(),
    );
    return transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.database.runAsync(
      'DELETE FROM transactions WHERE id = ? AND ledger_id = ?',
      id,
      this.requireLedgerId(),
    );
  }

  async listBudgets(): Promise<Budget[]> {
    const rows = await this.database.getAllAsync<BudgetRow>(
      `SELECT category_id, limit_minor AS limit_cents, updated_at
       FROM budget_plans WHERE ledger_id = ? AND month = ? ORDER BY category_id`,
      this.requireLedgerId(),
      this.migrationContext.currentMonth,
    );
    return rows.map(mapBudget);
  }

  async setBudget(categoryId: ExpenseCategoryId, limitCents: number): Promise<Budget | undefined> {
    validateBudgetAmount(categoryId, limitCents);
    if (limitCents === 0) {
      await this.database.runAsync(
        'DELETE FROM budget_plans WHERE ledger_id = ? AND category_id = ? AND month = ?',
        this.requireLedgerId(),
        categoryId,
        this.migrationContext.currentMonth,
      );
      return undefined;
    }
    const budget: Budget = { categoryId, limitCents, updatedAt: new Date().toISOString() };
    await this.database.runAsync(
      `INSERT INTO budget_plans(
         ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
       ) VALUES (?, ?, ?, ?, 'none', ?)
       ON CONFLICT(ledger_id, category_id, month) DO UPDATE SET
       limit_minor = excluded.limit_minor,
       updated_at = excluded.updated_at`,
      this.requireLedgerId(),
      budget.categoryId,
      this.migrationContext.currentMonth,
      budget.limitCents,
      budget.updatedAt,
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
      await this.database.runAsync('DELETE FROM transactions WHERE ledger_id = ?', this.requireLedgerId());
      await this.database.runAsync(
        'DELETE FROM budget_plans WHERE ledger_id = ? AND month = ?',
        this.requireLedgerId(),
        this.migrationContext.currentMonth,
      );
      for (const transaction of valid.transactions) await this.insertTransaction(transaction);
      for (const budget of valid.budgets) {
        await this.database.runAsync(
          `INSERT INTO budget_plans(
             ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
           ) VALUES (?, ?, ?, ?, 'none', ?)`,
          this.requireLedgerId(),
          budget.categoryId,
          this.migrationContext.currentMonth,
          budget.limitCents,
          budget.updatedAt,
        );
      }
    });
  }

  async deleteAll(): Promise<void> {
    await this.database.withTransactionAsync(async () => {
      await this.database.runAsync('DELETE FROM transactions WHERE ledger_id = ?', this.requireLedgerId());
      await this.database.runAsync(
        'DELETE FROM budget_plans WHERE ledger_id = ? AND month = ?',
        this.requireLedgerId(),
        this.migrationContext.currentMonth,
      );
    });
  }

  private async insertTransaction(transaction: Transaction): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO transactions
       (id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      transaction.id,
      this.requireLedgerId(),
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

  private requireLedgerId(): string {
    if (!this.ledgerId) throw new Error('Finova repository has not been initialized.');
    return this.ledgerId;
  }
}

export async function openFinanceRepository(): Promise<SQLiteFinanceRepository> {
  const database = await SQLite.openDatabaseAsync('finova.db');
  const repository = new SQLiteFinanceRepository(database);
  await repository.initialize();
  return repository;
}
