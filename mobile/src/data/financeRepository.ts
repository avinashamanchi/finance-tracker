import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { ExpenseCategoryId } from '../domain/categories';
import {
  BackupScaleUnavailableError,
  DataBoundaryError,
  ExportScaleUnavailableError,
  LedgerCapacityError,
} from '../domain/errors';
import { addMinorExact } from '../domain/money';
import { assertMonth } from '../domain/summaries';
import type {
  Budget,
  BudgetUsage,
  FinanceSnapshot,
  Ledger,
  MonthSummary,
  MonthlyPoint,
  Transaction,
  TransactionDraft,
} from '../domain/types';
import { getMonthSummary, getSixMonthTrend } from './aggregateQueries';
import {
  createExpoMigrationDatabase,
  serializeDatabaseAccess,
  type ExpoMigrationDatabaseSource,
} from './configureConnection';
import { runMigrations } from './migrations';
import type { MigrationContext, MigrationDatabase } from './migrations/types';
import { SQLitePlanningRepository } from './planningRepository';
import type {
  CursorDirection,
  TransactionCursor,
  TransactionEdge,
  TransactionPage,
  TransactionQuery,
} from './queryTypes';
import { TransactionQueryService } from './transactionQueries';
import { SQLiteRecurringRepository } from './recurringRepository';
import {
  MAX_LEDGER_TRANSACTIONS,
  isUuidV4,
  isValidTransactionId,
  validateBudget,
  validateBudgetAmount,
  validateDraft,
  validateLedger,
  validateSnapshot,
  validateTransaction,
} from './validation';

export type TransactionExport = Readonly<{
  ledger: Ledger;
  transactions: readonly Transaction[];
}>;

export interface FinanceRepository {
  initialize(): Promise<void>;
  getLedger(): Promise<Ledger>;
  listTransactionsPage(query: TransactionQuery): Promise<TransactionPage>;
  createTransactionCursor(
    query: TransactionQuery,
    direction: CursorDirection,
    edge: TransactionEdge,
  ): Promise<TransactionCursor>;
  getTransactionById(id: string): Promise<Transaction | null>;
  createTransaction(draft: TransactionDraft): Promise<Transaction>;
  updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  listBudgets(month?: string): Promise<Budget[]>;
  setBudget(
    categoryId: ExpenseCategoryId,
    limitMinor: number,
    month?: string,
  ): Promise<Budget | undefined>;
  getMonthSummary(month: string): Promise<MonthSummary>;
  getSixMonthTrend(anchorMonth: string): Promise<MonthlyPoint[]>;
  getRecentTransactions(month: string, limit?: number): Promise<readonly Transaction[]>;
  getBudgetUsage(month: string): Promise<BudgetUsage>;
  readTransactionsForCsv(): Promise<TransactionExport>;
  snapshot(): Promise<FinanceSnapshot>;
  replaceAll(snapshot: FinanceSnapshot): Promise<void>;
  deleteAll(): Promise<void>;
}

type TransactionRow = Readonly<{
  id: string;
  kind: 'income' | 'expense';
  amount_minor: number;
  category_id: Transaction['categoryId'];
  description: string;
  occurred_on: string;
  is_recurring: number;
  created_at: string;
  updated_at: string;
}>;

type BudgetRow = Readonly<{
  category_id: ExpenseCategoryId;
  limit_minor: number;
  updated_at: string;
}>;

type LedgerRow = Readonly<{
  id: string;
  name: string;
  currency_code: string;
  currency_minor_unit: number;
  created_at: string;
  updated_at: string;
}>;

type CountRow = Readonly<{ count: number }>;

function currentLocalMonth(now: Date): string {
  const year = now.getFullYear();
  if (!Number.isFinite(now.getTime()) || year < 0 || year > 9999) {
    throw new Error('Finova could not determine the current local month.');
  }
  return `${year.toString().padStart(4, '0')}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

function requireMonth(month: string): string {
  try {
    assertMonth(month);
    return month;
  } catch {
    throw new DataBoundaryError();
  }
}

function createMigrationContext(now: Date): MigrationContext {
  return {
    legacyLedgerId: Crypto.randomUUID(),
    currentMonth: currentLocalMonth(now),
    nowIso: now.toISOString(),
  };
}

function mapTransaction(row: TransactionRow): Transaction {
  if (row.is_recurring !== 0 && row.is_recurring !== 1) throw new DataBoundaryError();
  try {
    return validateTransaction({
      id: row.id,
      kind: row.kind,
      amountMinor: row.amount_minor,
      categoryId: row.category_id,
      description: row.description,
      occurredOn: row.occurred_on,
      isRecurring: row.is_recurring === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof DataBoundaryError) throw error;
    throw new DataBoundaryError();
  }
}

function mapBudget(row: BudgetRow): Budget {
  try {
    return validateBudget({
      categoryId: row.category_id,
      limitMinor: row.limit_minor,
      updatedAt: row.updated_at,
    });
  } catch {
    throw new DataBoundaryError();
  }
}

function mapLedger(row: LedgerRow): Ledger {
  return validateLedger({
    id: row.id,
    name: row.name,
    currencyCode: row.currency_code,
    currencyMinorUnit: row.currency_minor_unit as Ledger['currencyMinorUnit'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SQLiteFinanceRepository implements FinanceRepository {
  private readonly migrationDatabase: MigrationDatabase;
  private readonly migrationContext: MigrationContext;
  private readonly clock: () => Date;
  private readonly transactionQueries: TransactionQueryService;
  private ledger: Ledger | null = null;

  constructor(
    database: SQLite.SQLiteDatabase,
    migrationContext?: MigrationContext,
    clock: () => Date = () => new Date(),
  ) {
    this.clock = clock;
    this.migrationContext = migrationContext ?? createMigrationContext(this.readClock());
    this.migrationDatabase = createExpoMigrationDatabase(
      database as unknown as ExpoMigrationDatabaseSource,
    );
    this.transactionQueries = new TransactionQueryService(this.migrationDatabase);
  }

  async initialize(): Promise<void> {
    await runMigrations(this.migrationDatabase, this.migrationContext);
    await this.withSerializedAccess(async () => {
      const rows = await this.migrationDatabase.all<LedgerRow>(
        `SELECT id, name, currency_code, currency_minor_unit, created_at, updated_at
         FROM ledgers ORDER BY rowid LIMIT 2`,
      );
      if (rows.length !== 1) throw new DataBoundaryError();
      this.ledger = mapLedger(rows[0]);
    });
  }

  async getLedger(): Promise<Ledger> {
    return { ...this.requireLedger() };
  }

  createRecurringRepository(): SQLiteRecurringRepository {
    return new SQLiteRecurringRepository(this.migrationDatabase, this.requireLedger().id, {
      now: this.clock,
    });
  }

  createPlanningRepository(): SQLitePlanningRepository {
    return new SQLitePlanningRepository(this.migrationDatabase, this.requireLedger().id, {
      now: this.clock,
    });
  }

  async listTransactionsPage(query: TransactionQuery): Promise<TransactionPage> {
    this.requireMatchingLedger(query.ledgerId);
    return this.withSerializedAccess(() => this.transactionQueries.listTransactionsPage(query));
  }

  async createTransactionCursor(
    query: TransactionQuery,
    direction: CursorDirection,
    edge: TransactionEdge,
  ): Promise<TransactionCursor> {
    this.requireMatchingLedger(query.ledgerId);
    return this.withSerializedAccess(() => this.transactionQueries.createCursor(query, direction, edge));
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    if (!isValidTransactionId(id)) throw new DataBoundaryError();
    return this.withSerializedAccess(async () => {
      const row = await this.migrationDatabase.first<TransactionRow>(
        `SELECT id, kind, amount_minor, category_id, description, occurred_on,
                legacy_recurring AS is_recurring, created_at, updated_at
         FROM transactions WHERE id = ? AND ledger_id = ?`,
        [id, this.requireLedger().id],
      );
      return row ? mapTransaction(row) : null;
    });
  }

  async createTransaction(draft: TransactionDraft): Promise<Transaction> {
    const valid = validateDraft(draft);
    const id = Crypto.randomUUID();
    if (!isUuidV4(id)) throw new Error('Finova could not create a transaction identifier.');
    const now = this.readClock().toISOString();
    const transaction = validateTransaction({
      ...valid,
      id,
      createdAt: now,
      updatedAt: now,
    });
    return this.withSerializedAccess(async () => {
      await this.migrationDatabase.exclusive(async (database) => {
        const row = await database.first<CountRow>(
          `SELECT COUNT(*) AS count FROM (
             SELECT 1 FROM transactions WHERE ledger_id = ? LIMIT ?
           ) AS bounded_ledger`,
          [this.requireLedger().id, MAX_LEDGER_TRANSACTIONS + 1],
        );
        if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw new DataBoundaryError();
        if (row.count >= MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
        await this.insertTransaction(transaction, database);
      });
      return { ...transaction };
    });
  }

  async updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction> {
    if (!isValidTransactionId(id)) throw new DataBoundaryError();
    const valid = validateDraft(draft);
    return this.withSerializedAccess(async () => this.migrationDatabase.exclusive(async (database) => {
      const existing = await database.first<TransactionRow>(
        `SELECT id, kind, amount_minor, category_id, description, occurred_on,
                legacy_recurring AS is_recurring, created_at, updated_at
         FROM transactions WHERE id = ? AND ledger_id = ?`,
        [id, this.requireLedger().id],
      );
      if (!existing) throw new Error('Transaction not found.');
      const transaction = validateTransaction({
        ...mapTransaction(existing),
        ...valid,
        updatedAt: this.readClock().toISOString(),
      });
      await database.run(
        `UPDATE transactions SET kind = ?, amount_minor = ?, category_id = ?, description = ?,
         occurred_on = ?, legacy_recurring = ?, updated_at = ? WHERE id = ? AND ledger_id = ?`,
        [
          transaction.kind,
          transaction.amountMinor,
          transaction.categoryId,
          transaction.description,
          transaction.occurredOn,
          transaction.isRecurring ? 1 : 0,
          transaction.updatedAt,
          transaction.id,
          this.requireLedger().id,
        ],
      );
      return { ...transaction };
    }));
  }

  async deleteTransaction(id: string): Promise<void> {
    if (!isValidTransactionId(id)) throw new DataBoundaryError();
    await this.withSerializedAccess(() => this.migrationDatabase.run(
      'DELETE FROM transactions WHERE id = ? AND ledger_id = ?',
      [id, this.requireLedger().id],
    ).then(() => undefined));
  }

  async listBudgets(month = currentLocalMonth(this.readClock())): Promise<Budget[]> {
    return this.withSerializedAccess(() => this.listBudgetsUnlocked(requireMonth(month), this.migrationDatabase));
  }

  async setBudget(
    categoryId: ExpenseCategoryId,
    limitMinor: number,
    month = currentLocalMonth(this.readClock()),
  ): Promise<Budget | undefined> {
    validateBudgetAmount(categoryId, limitMinor);
    const validMonth = requireMonth(month);
    return this.withSerializedAccess(async () => {
      const now = this.readClock().toISOString();
      if (limitMinor === 0) {
        await this.migrationDatabase.run(
          'DELETE FROM budget_plans WHERE ledger_id = ? AND category_id = ? AND month = ?',
          [this.requireLedger().id, categoryId, validMonth],
        );
        return undefined;
      }
      const budget = validateBudget({ categoryId, limitMinor, updatedAt: now });
      await this.migrationDatabase.run(
        `INSERT INTO budget_plans(
           ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
         ) VALUES (?, ?, ?, ?, 'none', ?)
         ON CONFLICT(ledger_id, category_id, month) DO UPDATE SET
         limit_minor = excluded.limit_minor,
         updated_at = excluded.updated_at`,
        [this.requireLedger().id, budget.categoryId, validMonth, budget.limitMinor, budget.updatedAt],
      );
      return { ...budget };
    });
  }

  async getMonthSummary(month: string): Promise<MonthSummary> {
    const validMonth = requireMonth(month);
    return this.withSerializedAccess(() => (
      getMonthSummary(this.migrationDatabase, this.requireLedger().id, validMonth)
    ));
  }

  async getSixMonthTrend(anchorMonth: string): Promise<MonthlyPoint[]> {
    const validMonth = requireMonth(anchorMonth);
    return this.withSerializedAccess(() => (
      getSixMonthTrend(this.migrationDatabase, this.requireLedger().id, validMonth)
    ));
  }

  async getRecentTransactions(month: string, limit = 4): Promise<readonly Transaction[]> {
    const validMonth = requireMonth(month);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new DataBoundaryError();
    return this.withSerializedAccess(async () => {
      const rows = await this.migrationDatabase.all<TransactionRow>(
        `SELECT id, kind, amount_minor, category_id, description, occurred_on,
                legacy_recurring AS is_recurring, created_at, updated_at
         FROM transactions
         WHERE ledger_id = ? AND occurred_on >= ? AND occurred_on < date(?, '+1 month')
         ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT ?`,
        [this.requireLedger().id, `${validMonth}-01`, `${validMonth}-01`, limit],
      );
      return rows.map(mapTransaction);
    });
  }

  async getBudgetUsage(month: string): Promise<BudgetUsage> {
    const validMonth = requireMonth(month);
    return this.withSerializedAccess(async () => {
      const summary = await getMonthSummary(
        this.migrationDatabase,
        this.requireLedger().id,
        validMonth,
      );
      const budgets = await this.listBudgetsUnlocked(validMonth, this.migrationDatabase);
      return {
        month: validMonth,
        budgets,
        expenseByCategory: { ...summary.expenseByCategory },
        totalLimitMinor: addMinorExact(budgets.map((budget) => budget.limitMinor)),
      };
    });
  }

  async readTransactionsForCsv(): Promise<TransactionExport> {
    return this.withSerializedAccess(async () => this.migrationDatabase.exclusive(async (database) => {
      const rows = await this.listTransactionRows(database, 501);
      if (rows.length > 500) throw new ExportScaleUnavailableError();
      return {
        ledger: { ...this.requireLedger() },
        transactions: rows.map(mapTransaction),
      };
    }));
  }

  async snapshot(): Promise<FinanceSnapshot> {
    return this.withSerializedAccess(async () => this.migrationDatabase.exclusive(async (database) => {
      const transactions = await this.listTransactionRows(database, 10_001);
      if (transactions.length > 10_000) throw new BackupScaleUnavailableError();
      const budgets = await this.listBudgetsUnlocked(
        currentLocalMonth(this.readClock()),
        database,
      );
      return { transactions: transactions.map(mapTransaction), budgets };
    }));
  }

  async replaceAll(snapshot: FinanceSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot);
    await this.withSerializedAccess(async () => {
      const month = currentLocalMonth(this.readClock());
      await this.migrationDatabase.exclusive(async (database) => {
        await this.clearLedgerFinanceRows(database);
        for (const transaction of valid.transactions) {
          await this.insertTransaction(transaction, database);
        }
        for (const budget of valid.budgets) {
          await database.run(
            `INSERT INTO budget_plans(
               ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
             ) VALUES (?, ?, ?, ?, 'none', ?)`,
            [
              this.requireLedger().id,
              budget.categoryId,
              month,
              budget.limitMinor,
              budget.updatedAt,
            ],
          );
        }
      });
    });
  }

  async deleteAll(): Promise<void> {
    await this.withSerializedAccess(async () => {
      await this.migrationDatabase.exclusive((database) => this.clearLedgerFinanceRows(database));
    });
  }

  private async listTransactionRows(
    database: MigrationDatabase,
    limit: number,
  ): Promise<readonly TransactionRow[]> {
    return database.all<TransactionRow>(
      `SELECT id, kind, amount_minor, category_id, description, occurred_on,
              legacy_recurring AS is_recurring, created_at, updated_at
       FROM transactions WHERE ledger_id = ?
       ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT ?`,
      [this.requireLedger().id, limit],
    );
  }

  private async listBudgetsUnlocked(
    month: string,
    database: MigrationDatabase,
  ): Promise<Budget[]> {
    const rows = await database.all<BudgetRow>(
      `SELECT category_id, limit_minor, updated_at
       FROM budget_plans WHERE ledger_id = ? AND month = ? ORDER BY category_id`,
      [this.requireLedger().id, month],
    );
    return rows.map(mapBudget);
  }

  private async insertTransaction(
    transaction: Transaction,
    database: MigrationDatabase,
  ): Promise<void> {
    await database.run(
      `INSERT INTO transactions
       (id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [
        transaction.id,
        this.requireLedger().id,
        transaction.kind,
        transaction.amountMinor,
        transaction.categoryId,
        transaction.description,
        transaction.occurredOn,
        transaction.isRecurring ? 1 : 0,
        transaction.createdAt,
        transaction.updatedAt,
      ],
    );
  }

  private async clearLedgerFinanceRows(database: MigrationDatabase): Promise<void> {
    const ledgerId = this.requireLedger().id;
    await database.run(
      `DELETE FROM goal_contributions
       WHERE goal_id IN (SELECT id FROM savings_goals WHERE ledger_id = ?)`,
      [ledgerId],
    );
    await database.run(
      `DELETE FROM expected_occurrences
       WHERE template_id IN (SELECT id FROM recurring_templates WHERE ledger_id = ?)`,
      [ledgerId],
    );
    await database.run('DELETE FROM savings_goals WHERE ledger_id = ?', [ledgerId]);
    await database.run('DELETE FROM recurring_templates WHERE ledger_id = ?', [ledgerId]);
    await database.run('DELETE FROM transactions WHERE ledger_id = ?', [ledgerId]);
    await database.run('DELETE FROM budget_plans WHERE ledger_id = ?', [ledgerId]);
  }

  private withSerializedAccess<T>(work: () => Promise<T>): Promise<T> {
    return serializeDatabaseAccess(this.migrationDatabase.identity, work);
  }

  private readClock(): Date {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error('Finova clock returned an invalid date.');
    }
    return new Date(value.getTime());
  }

  private requireLedger(): Ledger {
    if (!this.ledger) throw new Error('Finova repository has not been initialized.');
    return this.ledger;
  }

  private requireMatchingLedger(ledgerId: string): void {
    if (ledgerId !== this.requireLedger().id) throw new DataBoundaryError();
  }
}

export async function openFinanceRepository(): Promise<SQLiteFinanceRepository> {
  const database = await SQLite.openDatabaseAsync('finova.db');
  const repository = new SQLiteFinanceRepository(database);
  await repository.initialize();
  return repository;
}
