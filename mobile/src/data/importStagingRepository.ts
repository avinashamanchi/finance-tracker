import { DataBoundaryError, LedgerCapacityError } from '../domain/errors';
import type { BackupCounts } from '../services/backupFormat';
import type { DataBackupRecord } from '../services/backupRecords';
import { MAX_LEDGER_TRANSACTIONS } from './validation';
import { serializeDatabaseAccess } from './configureConnection';
import type { MigrationDatabase } from './migrations';

const activeImports = new Set<string>();
const TABLES = Object.freeze([
  'finova_import_goal_contributions',
  'finova_import_expected_occurrences',
  'finova_import_savings_goals',
  'finova_import_recurring_templates',
  'finova_import_transactions',
  'finova_import_budget_plans',
  'finova_import_ledgers',
] as const);

type CountRow = Readonly<{ count: number }>;

function requireExpectedCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new DataBoundaryError();
  }
  return value;
}

export interface ImportStagingSession {
  appendRecords(records: readonly DataBackupRecord[]): Promise<void>;
  replaceFromStaging(expected: BackupCounts): Promise<void>;
  dropStaging(): Promise<void>;
}

export class SQLiteImportStagingRepository implements ImportStagingSession {
  private released = false;

  private constructor(
    private readonly database: MigrationDatabase,
    private readonly targetLedgerId: string,
  ) {}

  static async begin(
    database: MigrationDatabase,
    targetLedgerId: string,
  ): Promise<SQLiteImportStagingRepository> {
    if (activeImports.has(database.identity)) {
      throw new Error('A Finova backup import is already running.');
    }
    activeImports.add(database.identity);
    const session = new SQLiteImportStagingRepository(database, targetLedgerId);
    try {
      await session.prepare();
      return session;
    } catch (error) {
      session.release();
      throw error;
    }
  }

  async appendRecords(records: readonly DataBackupRecord[]): Promise<void> {
    if (this.released || records.length < 1 || records.length > 500) {
      throw new DataBoundaryError();
    }
    await this.serialized(() => this.database.exclusive(async (database) => {
      for (const record of records) await this.insertRecord(database, record);
    }));
  }

  async replaceFromStaging(expected: BackupCounts): Promise<void> {
    if (this.released) throw new DataBoundaryError();
    await this.serialized(() => this.database.exclusive(async (database) => {
      await this.validateStaging(database, expected);
      await this.clearLiveRows(database);
      await database.run(`
        UPDATE ledgers SET
          name = (SELECT name FROM finova_import_ledgers LIMIT 1),
          currency_code = (SELECT currency_code FROM finova_import_ledgers LIMIT 1),
          currency_minor_unit = (SELECT currency_minor_unit FROM finova_import_ledgers LIMIT 1),
          created_at = (SELECT created_at FROM finova_import_ledgers LIMIT 1),
          updated_at = (SELECT updated_at FROM finova_import_ledgers LIMIT 1)
        WHERE id = ?
      `, [this.targetLedgerId]);
      await database.run(`
        INSERT INTO transactions(
          id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
          legacy_recurring, source_template_id, source_due_on, created_at, updated_at
        ) SELECT id, ?, kind, amount_minor, category_id, description, occurred_on,
          legacy_recurring, source_template_id, source_due_on, created_at, updated_at
        FROM finova_import_transactions ORDER BY rowid
      `, [this.targetLedgerId]);
      await database.run(`
        INSERT INTO recurring_templates(
          id, ledger_id, description, category_id, amount_minor, due_day,
          start_month, end_month, enabled, created_at, updated_at
        ) SELECT id, ?, description, category_id, amount_minor, due_day,
          start_month, end_month, enabled, created_at, updated_at
        FROM finova_import_recurring_templates ORDER BY rowid
      `, [this.targetLedgerId]);
      await database.run(`
        INSERT INTO expected_occurrences(
          id, template_id, due_on, transaction_id, created_at, updated_at
        ) SELECT id, template_id, due_on, transaction_id, created_at, updated_at
        FROM finova_import_expected_occurrences ORDER BY rowid
      `);
      await database.run(`
        INSERT INTO budget_plans(
          ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
        ) SELECT ?, category_id, month, limit_minor, rollover_policy, updated_at
        FROM finova_import_budget_plans ORDER BY rowid
      `, [this.targetLedgerId]);
      await database.run(`
        INSERT INTO savings_goals(
          id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
        ) SELECT id, ?, name, target_minor, target_on, archived_at, created_at, updated_at
        FROM finova_import_savings_goals ORDER BY rowid
      `, [this.targetLedgerId]);
      await database.run(`
        INSERT INTO goal_contributions(
          id, goal_id, amount_minor, occurred_on, note, created_at
        ) SELECT id, goal_id, amount_minor, occurred_on, note, created_at
        FROM finova_import_goal_contributions ORDER BY rowid
      `);
      const foreignKeyFailure = await database.first<{ table: string }>('PRAGMA foreign_key_check');
      if (foreignKeyFailure) throw new DataBoundaryError();
      await this.dropTables(database);
    }));
    this.release();
  }

  async dropStaging(): Promise<void> {
    if (this.released) return;
    try {
      await this.serialized(() => this.dropTables(this.database));
    } finally {
      this.release();
    }
  }

  private async prepare(): Promise<void> {
    await this.serialized(async () => {
      await this.dropTables(this.database);
      await this.database.exec(`
        CREATE TEMP TABLE finova_import_ledgers(
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          currency_code TEXT NOT NULL,
          currency_minor_unit INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TEMP TABLE finova_import_transactions(
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          amount_minor INTEGER NOT NULL,
          category_id TEXT NOT NULL,
          description TEXT NOT NULL,
          occurred_on TEXT NOT NULL,
          legacy_recurring INTEGER NOT NULL,
          source_template_id TEXT,
          source_due_on TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TEMP TABLE finova_import_budget_plans(
          ledger_id TEXT NOT NULL,
          category_id TEXT NOT NULL,
          month TEXT NOT NULL,
          limit_minor INTEGER NOT NULL,
          rollover_policy TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(ledger_id, category_id, month)
        );
        CREATE TEMP TABLE finova_import_recurring_templates(
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          description TEXT NOT NULL,
          category_id TEXT NOT NULL,
          amount_minor INTEGER NOT NULL,
          due_day INTEGER NOT NULL,
          start_month TEXT NOT NULL,
          end_month TEXT,
          enabled INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TEMP TABLE finova_import_expected_occurrences(
          id TEXT PRIMARY KEY NOT NULL,
          template_id TEXT NOT NULL,
          due_on TEXT NOT NULL,
          transaction_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(template_id, due_on)
        );
        CREATE TEMP TABLE finova_import_savings_goals(
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          name TEXT NOT NULL,
          target_minor INTEGER NOT NULL,
          target_on TEXT,
          archived_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TEMP TABLE finova_import_goal_contributions(
          id TEXT PRIMARY KEY NOT NULL,
          goal_id TEXT NOT NULL,
          amount_minor INTEGER NOT NULL,
          occurred_on TEXT NOT NULL,
          note TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    });
  }

  private async insertRecord(database: MigrationDatabase, record: DataBackupRecord): Promise<void> {
    switch (record.kind) {
      case 'ledger':
        return database.run(
          `INSERT INTO finova_import_ledgers VALUES(?, ?, ?, ?, ?, ?)`,
          [record.id, record.name, record.currencyCode, record.currencyMinorUnit, record.createdAt, record.updatedAt],
        );
      case 'transaction':
        return database.run(
          `INSERT INTO finova_import_transactions VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [record.id, record.ledgerId, record.transactionKind, record.amountMinor,
            record.categoryId, record.description, record.occurredOn, record.isRecurring ? 1 : 0,
            record.sourceTemplateId, record.sourceDueOn, record.createdAt, record.updatedAt],
        );
      case 'budget_plan':
        return database.run(
          `INSERT INTO finova_import_budget_plans VALUES(?, ?, ?, ?, ?, ?)`,
          [record.ledgerId, record.categoryId, record.month, record.limitMinor,
            record.rolloverPolicy, record.updatedAt],
        );
      case 'recurring_template':
        return database.run(
          `INSERT INTO finova_import_recurring_templates VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [record.id, record.ledgerId, record.description, record.categoryId, record.amountMinor,
            record.dueDay, record.startMonth, record.endMonth, record.enabled ? 1 : 0,
            record.createdAt, record.updatedAt],
        );
      case 'expected_occurrence':
        return database.run(
          `INSERT INTO finova_import_expected_occurrences VALUES(?, ?, ?, ?, ?, ?)`,
          [record.id, record.templateId, record.dueOn, record.transactionId,
            record.createdAt, record.updatedAt],
        );
      case 'savings_goal':
        return database.run(
          `INSERT INTO finova_import_savings_goals VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
          [record.id, record.ledgerId, record.name, record.targetMinor, record.targetOn,
            record.archivedAt, record.createdAt, record.updatedAt],
        );
      case 'goal_contribution':
        return database.run(
          `INSERT INTO finova_import_goal_contributions VALUES(?, ?, ?, ?, ?, ?)`,
          [record.id, record.goalId, record.amountMinor, record.occurredOn, record.note, record.createdAt],
        );
    }
  }

  private async validateStaging(database: MigrationDatabase, expected: BackupCounts): Promise<void> {
    if (expected.manifest !== 1 || expected.ledger !== 1) throw new DataBoundaryError();
    const checks: readonly [string, number][] = [
      ['finova_import_ledgers', expected.ledger],
      ['finova_import_transactions', expected.transaction],
      ['finova_import_budget_plans', expected.budget_plan],
      ['finova_import_recurring_templates', expected.recurring_template],
      ['finova_import_expected_occurrences', expected.expected_occurrence],
      ['finova_import_savings_goals', expected.savings_goal],
      ['finova_import_goal_contributions', expected.goal_contribution],
    ];
    for (const [table, count] of checks) {
      const row = await database.first<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`);
      if (!row || requireExpectedCount(row.count) !== requireExpectedCount(count)) {
        throw new DataBoundaryError();
      }
    }
    if (expected.transaction > MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
    const badLedgerReference = await database.first<CountRow>(`
      SELECT COUNT(*) AS count FROM (
        SELECT ledger_id FROM finova_import_transactions
        UNION ALL SELECT ledger_id FROM finova_import_budget_plans
        UNION ALL SELECT ledger_id FROM finova_import_recurring_templates
        UNION ALL SELECT ledger_id FROM finova_import_savings_goals
      ) AS refs
      WHERE ledger_id != (SELECT id FROM finova_import_ledgers LIMIT 1)
    `);
    if (!badLedgerReference || badLedgerReference.count !== 0) throw new DataBoundaryError();
    const orphanOccurrences = await database.first<CountRow>(`
      SELECT COUNT(*) AS count FROM finova_import_expected_occurrences AS o
      LEFT JOIN finova_import_recurring_templates AS t ON t.id = o.template_id
      LEFT JOIN finova_import_transactions AS x ON x.id = o.transaction_id
      WHERE t.id IS NULL OR (o.transaction_id IS NOT NULL AND x.id IS NULL)
    `);
    if (!orphanOccurrences || orphanOccurrences.count !== 0) throw new DataBoundaryError();
    const orphanContributions = await database.first<CountRow>(`
      SELECT COUNT(*) AS count FROM finova_import_goal_contributions AS c
      LEFT JOIN finova_import_savings_goals AS g ON g.id = c.goal_id
      WHERE g.id IS NULL
    `);
    if (!orphanContributions || orphanContributions.count !== 0) throw new DataBoundaryError();
    const orphanSources = await database.first<CountRow>(`
      SELECT COUNT(*) AS count FROM finova_import_transactions AS x
      LEFT JOIN finova_import_recurring_templates AS t ON t.id = x.source_template_id
      WHERE x.source_template_id IS NOT NULL AND t.id IS NULL
    `);
    if (!orphanSources || orphanSources.count !== 0) throw new DataBoundaryError();
  }

  private async clearLiveRows(database: MigrationDatabase): Promise<void> {
    await database.run(`DELETE FROM goal_contributions WHERE goal_id IN (
      SELECT id FROM savings_goals WHERE ledger_id = ?
    )`, [this.targetLedgerId]);
    await database.run(`DELETE FROM expected_occurrences WHERE template_id IN (
      SELECT id FROM recurring_templates WHERE ledger_id = ?
    )`, [this.targetLedgerId]);
    await database.run('DELETE FROM savings_goals WHERE ledger_id = ?', [this.targetLedgerId]);
    await database.run('DELETE FROM recurring_templates WHERE ledger_id = ?', [this.targetLedgerId]);
    await database.run('DELETE FROM transactions WHERE ledger_id = ?', [this.targetLedgerId]);
    await database.run('DELETE FROM budget_plans WHERE ledger_id = ?', [this.targetLedgerId]);
  }

  private async dropTables(database: MigrationDatabase): Promise<void> {
    for (const table of TABLES) await database.exec(`DROP TABLE IF EXISTS temp.${table}`);
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    return serializeDatabaseAccess(this.database.identity, work);
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    activeImports.delete(this.database.identity);
  }
}
