import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { LATEST_SCHEMA_VERSION, runMigrations } from '../src/data/migrations';
import type { MigrationContext, MigrationDatabase } from '../src/data/migrations/types';
import { SQLiteFinanceRepository } from '../src/data/financeRepository';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const SHIPPED_V1_SQL = readFileSync(
  join(__dirname, 'fixtures', 'shippedV1Schema.sql'),
  'utf8',
);

const CONTEXT: MigrationContext = {
  legacyLedgerId: '10000000-0000-4000-8000-000000000001',
  currentMonth: '2026-08',
  nowIso: '2026-08-07T19:30:00.000Z',
};

const SECOND_CONTEXT: MigrationContext = {
  legacyLedgerId: '20000000-0000-4000-8000-000000000002',
  currentMonth: '2026-09',
  nowIso: '2026-09-01T01:02:03.000Z',
};

const FROZEN_V2_DELTA_SQL = `
  CREATE TABLE ledgers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
    currency_code TEXT NOT NULL CHECK(currency_code GLOB '[A-Z][A-Z][A-Z]'),
    currency_minor_unit INTEGER NOT NULL CHECK(currency_minor_unit BETWEEN 0 AND 3),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO ledgers(id, name, currency_code, currency_minor_unit, created_at, updated_at)
    VALUES('30000000-0000-4000-8000-000000000003', 'Personal', 'USD', 2,
      '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
  CREATE TABLE transactions_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 9007199254740991),
    category_id TEXT NOT NULL,
    description TEXT NOT NULL,
    occurred_on TEXT NOT NULL,
    legacy_recurring INTEGER NOT NULL DEFAULT 0 CHECK(legacy_recurring IN (0,1)),
    source_template_id TEXT,
    source_due_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_template_id, source_due_on)
  );
  INSERT INTO transactions_v2(
    id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
    legacy_recurring, source_template_id, source_due_on, created_at, updated_at
  ) SELECT id, '30000000-0000-4000-8000-000000000003', kind, amount_cents,
    category_id, description, occurred_on, is_recurring, NULL, NULL, created_at, updated_at
    FROM transactions;
  DROP TABLE transactions;
  ALTER TABLE transactions_v2 RENAME TO transactions;
  CREATE INDEX transactions_ledger_order
    ON transactions(ledger_id, occurred_on DESC, created_at DESC, id DESC);
  CREATE INDEX transactions_ledger_month_kind
    ON transactions(ledger_id, occurred_on, kind, category_id);
  CREATE VIRTUAL TABLE transaction_fts USING fts5(
    description, category_id, content='transactions', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER transactions_fts_insert AFTER INSERT ON transactions BEGIN
    INSERT INTO transaction_fts(rowid, description, category_id)
      VALUES(new.rowid, new.description, new.category_id);
  END;
  CREATE TRIGGER transactions_fts_delete AFTER DELETE ON transactions BEGIN
    INSERT INTO transaction_fts(transaction_fts, rowid, description, category_id)
      VALUES('delete', old.rowid, old.description, old.category_id);
  END;
  CREATE TRIGGER transactions_fts_update AFTER UPDATE ON transactions BEGIN
    INSERT INTO transaction_fts(transaction_fts, rowid, description, category_id)
      VALUES('delete', old.rowid, old.description, old.category_id);
    INSERT INTO transaction_fts(rowid, description, category_id)
      VALUES(new.rowid, new.description, new.category_id);
  END;
  INSERT INTO transaction_fts(transaction_fts) VALUES('rebuild');
  PRAGMA user_version = 2;
`;

const FROZEN_V3_DELTA_SQL = `
  CREATE TABLE recurring_templates (
    id TEXT PRIMARY KEY NOT NULL,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 120),
    category_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 9007199254740991),
    due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31),
    start_month TEXT NOT NULL,
    end_month TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX recurring_templates_ledger_enabled
    ON recurring_templates(ledger_id, enabled, start_month);
  CREATE TABLE expected_occurrences (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
    due_on TEXT NOT NULL,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(template_id, due_on)
  );
  CREATE INDEX expected_occurrences_due
    ON expected_occurrences(due_on, template_id);
  INSERT INTO recurring_templates(
    id, ledger_id, description, category_id, amount_minor, due_day, start_month,
    end_month, enabled, created_at, updated_at
  ) VALUES(
    'frozen-template', '30000000-0000-4000-8000-000000000003', 'Internet',
    'utilities', 6500, 15, '2026-05', NULL, 1,
    '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'
  );
  INSERT INTO expected_occurrences(id, template_id, due_on, transaction_id, created_at, updated_at)
    VALUES('frozen-occurrence', 'frozen-template', '2026-05-15', NULL,
      '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
  PRAGMA user_version = 3;
`;

const FROZEN_V4_DELTA_SQL = `
  CREATE TABLE budget_plans (
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    month TEXT NOT NULL,
    limit_minor INTEGER NOT NULL CHECK(typeof(limit_minor) = 'integer' AND limit_minor BETWEEN 0 AND 9007199254740991),
    rollover_policy TEXT NOT NULL DEFAULT 'none' CHECK(rollover_policy IN ('none','carry_unused')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(ledger_id, category_id, month)
  );
  CREATE INDEX budget_plans_ledger_month ON budget_plans(ledger_id, month, category_id);
  INSERT INTO budget_plans(ledger_id, category_id, month, limit_minor, rollover_policy, updated_at)
    SELECT '30000000-0000-4000-8000-000000000003', category_id, '2026-05', limit_cents,
      'none', updated_at FROM budgets;
  DROP TABLE budgets;
  CREATE TABLE savings_goals (
    id TEXT PRIMARY KEY NOT NULL,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    target_minor INTEGER NOT NULL CHECK(typeof(target_minor) = 'integer' AND target_minor BETWEEN 1 AND 9007199254740991),
    target_on TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX savings_goals_active_name
    ON savings_goals(ledger_id, lower(name)) WHERE archived_at IS NULL;
  CREATE TABLE goal_contributions (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 0 AND 9007199254740991),
    occurred_on TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX goal_contributions_goal_order
    ON goal_contributions(goal_id, occurred_on DESC, created_at DESC, id DESC);
  INSERT INTO savings_goals(
    id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
  ) VALUES(
    'frozen-goal', '30000000-0000-4000-8000-000000000003', 'Emergency fund',
    300000, NULL, NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'
  );
  INSERT INTO goal_contributions(id, goal_id, amount_minor, occurred_on, note, created_at)
    VALUES('frozen-contribution', 'frozen-goal', 25000, '2026-05-02', 'Initial',
      '2026-05-02T00:00:00.000Z');
  PRAGMA user_version = 4;
`;

type FixtureVersion =
  | 'pristine-v0'
  | 'full-v0'
  | 'missing-index-v0'
  | 'transactions-v0'
  | 'transactions-missing-index-v0'
  | 'budgets-v0'
  | 'v1'
  | 'v2'
  | 'v3'
  | 'v4';

function seedShippedRows(database: MigrationDatabase): Promise<void> {
  return database.exec(`
    INSERT INTO transactions VALUES(
      'tx-income', 'income', 200000, 'salary', 'August Paycheck', '2026-08-01', 1,
      '2026-08-01T08:00:00.000Z', '2026-08-01T08:00:00.000Z'
    );
    INSERT INTO transactions VALUES(
      'tx-coffee', 'expense', 7550, 'groceries', 'Café Coffee Shop', '2026-08-02', 0,
      '2026-08-02T09:00:00.000Z', '2026-08-02T09:30:00.000Z'
    );
    INSERT INTO transactions VALUES(
      'tx-rent', 'expense', 120000, 'housing', 'August Rent', '2026-08-03', 1,
      '2026-08-03T10:00:00.000Z', '2026-08-03T10:00:00.000Z'
    );
    INSERT INTO budgets VALUES('groceries', 50000, '2026-08-01T11:00:00.000Z');
    INSERT INTO budgets VALUES('housing', 150000, '2026-08-01T12:00:00.000Z');
  `);
}

async function createFixture(database: MigrationDatabase, fixture: FixtureVersion): Promise<void> {
  if (fixture === 'pristine-v0') return;
  await database.exec(SHIPPED_V1_SQL);
  await seedShippedRows(database);
  if (fixture === 'full-v0') {
    await database.exec('PRAGMA user_version = 0;');
    return;
  }
  if (fixture === 'missing-index-v0') {
    await database.exec('DROP INDEX transactions_occurred_on; PRAGMA user_version = 0;');
    return;
  }
  if (fixture === 'transactions-v0') {
    await database.exec('DROP TABLE budgets; PRAGMA user_version = 0;');
    return;
  }
  if (fixture === 'transactions-missing-index-v0') {
    await database.exec('DROP TABLE budgets; DROP INDEX transactions_occurred_on; PRAGMA user_version = 0;');
    return;
  }
  if (fixture === 'budgets-v0') {
    await database.exec('DROP TABLE transactions; PRAGMA user_version = 0;');
    return;
  }
  if (fixture === 'v1') return;
  await database.exec(FROZEN_V2_DELTA_SQL);
  if (fixture === 'v2') return;
  await database.exec(FROZEN_V3_DELTA_SQL);
  if (fixture === 'v3') return;
  await database.exec(FROZEN_V4_DELTA_SQL);
}

async function alterCompatibleNamedFrozenFixture(
  database: MigrationDatabase,
  fixture: 'v1' | 'v2' | 'v3' | 'v4',
): Promise<void> {
  if (fixture === 'v1') {
    await database.exec(`
      DROP INDEX transactions_occurred_on;
      CREATE INDEX transactions_occurred_on ON transactions(created_at DESC);
    `);
    return;
  }
  if (fixture === 'v2') {
    await database.exec("UPDATE ledgers SET name = 'Household'");
    return;
  }
  if (fixture === 'v3') {
    await database.exec(`
      PRAGMA foreign_keys = OFF;
      DROP INDEX expected_occurrences_due;
      ALTER TABLE expected_occurrences RENAME TO expected_occurrences_wrong;
      CREATE TABLE expected_occurrences (
        id TEXT PRIMARY KEY NOT NULL,
        template_id TEXT NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
        due_on TEXT NOT NULL,
        transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(template_id, due_on)
      );
      INSERT INTO expected_occurrences SELECT * FROM expected_occurrences_wrong;
      DROP TABLE expected_occurrences_wrong;
      CREATE INDEX expected_occurrences_due ON expected_occurrences(due_on, template_id);
      PRAGMA foreign_keys = ON;
    `);
    return;
  }
  await database.exec(`
    DROP INDEX savings_goals_active_name;
    CREATE UNIQUE INDEX savings_goals_active_name
      ON savings_goals(ledger_id, lower(name));
  `);
}

async function logicalDigest(database: MigrationDatabase): Promise<string> {
  const schema = await database.all<{ type: string; name: string; sql: string | null }>(
    `SELECT type, name, sql FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  );
  const rows: Record<string, string | null> = {};
  for (const item of schema) {
    if (item.type === 'table' && !item.name.startsWith('transaction_fts')) {
      const columns = await database.all<{ name: string }>(`PRAGMA table_info("${item.name}")`);
      const encodedRow = columns
        .map((column) => `quote("${column.name}")`)
        .join(" || char(31) || ");
      const digest = await database.first<{ value: string | null }>(`
        SELECT group_concat(encoded, char(30)) AS value
        FROM (
          SELECT ${encodedRow} AS encoded FROM "${item.name}" ORDER BY rowid
        )
      `);
      rows[item.name] = digest?.value ?? null;
    }
  }
  return JSON.stringify({ schema, rows });
}

function failureAfter(database: MigrationDatabase, needle: string): MigrationDatabase {
  let injected = false;
  const wrap = (transaction: MigrationDatabase): MigrationDatabase => ({
    exec: async (sql) => {
      await transaction.exec(sql);
      if (!injected && sql.includes(needle)) {
        injected = true;
        throw new Error(`Injected after ${needle}`);
      }
    },
    run: async (sql, params) => {
      await transaction.run(sql, params);
      if (!injected && sql.includes(needle)) {
        injected = true;
        throw new Error(`Injected after ${needle}`);
      }
    },
    first: transaction.first,
    all: transaction.all,
    exclusive: async () => {
      throw new Error('Nested failure transactions are not supported.');
    },
  });
  return {
    exec: database.exec,
    run: database.run,
    first: database.first,
    all: database.all,
    exclusive: (work) => database.exclusive((transaction) => work(wrap(transaction))),
  };
}

function expoDatabaseFrom(database: MigrationDatabase, allowExclusive = true): Record<string, unknown> {
  const boundParams = (params: readonly unknown[]): readonly (string | number | null)[] => {
    if (params.length === 1 && Array.isArray(params[0])) {
      return params[0] as readonly (string | number | null)[];
    }
    return params as readonly (string | number | null)[];
  };
  const source: Record<string, unknown> = {
    execAsync: database.exec,
    runAsync: async (sql: string, ...params: readonly unknown[]) => {
      await database.run(sql, boundParams(params));
      return { changes: 0, lastInsertRowId: 0 };
    },
    getFirstAsync: (sql: string, ...params: readonly unknown[]) => (
      database.first(sql, boundParams(params))
    ),
    getAllAsync: (sql: string, ...params: readonly unknown[]) => (
      database.all(sql, boundParams(params))
    ),
    withTransactionAsync: async (work: () => Promise<void>) => {
      await database.exclusive(async () => work());
    },
  };
  if (allowExclusive) {
    source.withExclusiveTransactionAsync = async (
      work: (transaction: Record<string, unknown>) => Promise<void>,
    ) => {
      await database.exclusive(async (transaction) => {
        await work(expoDatabaseFrom(transaction, false));
      });
    };
  }
  return source;
}

async function seedEveryFinanceTable(database: MigrationDatabase, ledgerId: string): Promise<void> {
  await database.exec(`
    INSERT INTO transactions(
      id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
      legacy_recurring, source_template_id, source_due_on, created_at, updated_at
    ) VALUES(
      'lifecycle-tx', '${ledgerId}', 'expense', 1250, 'groceries', 'Lifecycle',
      '2026-08-01', 0, NULL, NULL, '${CONTEXT.nowIso}', '${CONTEXT.nowIso}'
    );
    INSERT INTO budget_plans(
      ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
    ) VALUES
      ('${ledgerId}', 'groceries', '2026-08', 50000, 'none', '${CONTEXT.nowIso}'),
      ('${ledgerId}', 'housing', '2026-09', 150000, 'carry_unused', '${CONTEXT.nowIso}');
    INSERT INTO recurring_templates(
      id, ledger_id, description, category_id, amount_minor, due_day, start_month,
      end_month, enabled, created_at, updated_at
    ) VALUES(
      'lifecycle-template', '${ledgerId}', 'Utilities', 'utilities', 6500, 15,
      '2026-08', NULL, 1, '${CONTEXT.nowIso}', '${CONTEXT.nowIso}'
    );
    INSERT INTO expected_occurrences(
      id, template_id, due_on, transaction_id, created_at, updated_at
    ) VALUES(
      'lifecycle-occurrence', 'lifecycle-template', '2026-08-15', 'lifecycle-tx',
      '${CONTEXT.nowIso}', '${CONTEXT.nowIso}'
    );
    INSERT INTO savings_goals(
      id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
    ) VALUES(
      'lifecycle-goal', '${ledgerId}', 'Emergency', 300000, NULL, NULL,
      '${CONTEXT.nowIso}', '${CONTEXT.nowIso}'
    );
    INSERT INTO goal_contributions(
      id, goal_id, amount_minor, occurred_on, note, created_at
    ) VALUES(
      'lifecycle-contribution', 'lifecycle-goal', 25000, '2026-08-02', 'Initial',
      '${CONTEXT.nowIso}'
    );
  `);
}

async function financeRowCounts(database: MigrationDatabase): Promise<Record<string, number>> {
  const tables = [
    'transactions',
    'budget_plans',
    'recurring_templates',
    'expected_occurrences',
    'savings_goals',
    'goal_contributions',
  ] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await database.first<{ count: number }>(`SELECT count(*) AS count FROM ${table}`);
    counts[table] = row?.count ?? -1;
  }
  return counts;
}

describe('ordered SQLite migrations', () => {
  let directory: string;
  let filename: string;
  let database: NodeMigrationAdapter;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'finova-migration-'));
    filename = join(directory, 'finova.sqlite');
    database = new NodeMigrationAdapter(filename);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each<FixtureVersion>([
    'pristine-v0',
    'full-v0',
    'missing-index-v0',
    'transactions-v0',
    'transactions-missing-index-v0',
    'budgets-v0',
    'v1',
    'v2',
    'v3',
    'v4',
  ])('upgrades the independently constructed %s fixture to v4', async (fixture) => {
    await createFixture(database, fixture);
    await runMigrations(database, CONTEXT);

    expect(await database.first('PRAGMA user_version')).toEqual({ user_version: LATEST_SCHEMA_VERSION });
    expect(await database.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(await database.first<{ count: number }>('SELECT count(*) AS count FROM ledgers'))
      .toEqual({ count: 1 });
    const expectedTransactionCount = fixture === 'pristine-v0' || fixture === 'budgets-v0' ? 0 : 3;
    const expectedBudgetCount = fixture === 'pristine-v0'
      || fixture === 'transactions-v0'
      || fixture === 'transactions-missing-index-v0'
      ? 0
      : 2;
    expect(await database.first('SELECT count(*) AS count FROM transactions'))
      .toEqual({ count: expectedTransactionCount });
    expect(await database.first('SELECT count(*) AS count FROM budget_plans'))
      .toEqual({ count: expectedBudgetCount });
    if (fixture === 'v2' || fixture === 'v3' || fixture === 'v4') {
      expect(await database.all('SELECT * FROM ledgers')).toEqual([{
        id: '30000000-0000-4000-8000-000000000003',
        name: 'Personal',
        currency_code: 'USD',
        currency_minor_unit: 2,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      }]);
      expect(await database.all(
        `SELECT id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
                legacy_recurring, source_template_id, source_due_on, created_at, updated_at
         FROM transactions WHERE id = 'tx-coffee'`,
      )).toEqual([{
        id: 'tx-coffee',
        ledger_id: '30000000-0000-4000-8000-000000000003',
        kind: 'expense',
        amount_minor: 7550,
        category_id: 'groceries',
        description: 'Café Coffee Shop',
        occurred_on: '2026-08-02',
        legacy_recurring: 0,
        source_template_id: null,
        source_due_on: null,
        created_at: '2026-08-02T09:00:00.000Z',
        updated_at: '2026-08-02T09:30:00.000Z',
      }]);
    }
    if (fixture === 'v3' || fixture === 'v4') {
      expect(await database.all(
        `SELECT id, ledger_id, description, category_id, amount_minor, due_day,
                start_month, end_month, enabled, created_at, updated_at
         FROM recurring_templates`,
      )).toEqual([{
        id: 'frozen-template',
        ledger_id: '30000000-0000-4000-8000-000000000003',
        description: 'Internet',
        category_id: 'utilities',
        amount_minor: 6500,
        due_day: 15,
        start_month: '2026-05',
        end_month: null,
        enabled: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      }]);
      expect(await database.all('SELECT * FROM expected_occurrences')).toEqual([{
        id: 'frozen-occurrence',
        template_id: 'frozen-template',
        due_on: '2026-05-15',
        transaction_id: null,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      }]);
    }
    if (fixture === 'v4') {
      expect(await database.all(
        'SELECT category_id, month, limit_minor FROM budget_plans ORDER BY category_id',
      )).toEqual([
        { category_id: 'groceries', month: '2026-05', limit_minor: 50000 },
        { category_id: 'housing', month: '2026-05', limit_minor: 150000 },
      ]);
      expect(await database.all(
        'SELECT id, name, target_minor, target_on, archived_at FROM savings_goals',
      )).toEqual([{
        id: 'frozen-goal',
        name: 'Emergency fund',
        target_minor: 300000,
        target_on: null,
        archived_at: null,
      }]);
      expect(await database.all(
        'SELECT id, goal_id, amount_minor, occurred_on, note FROM goal_contributions',
      )).toEqual([{
        id: 'frozen-contribution',
        goal_id: 'frozen-goal',
        amount_minor: 25000,
        occurred_on: '2026-05-02',
        note: 'Initial',
      }]);
    }
    await runMigrations(database, SECOND_CONTEXT);
    expect(await database.first('PRAGMA user_version')).toEqual({ user_version: 4 });
  });

  it('preserves every shipped field and maps timeless budgets to the supplied local month', async () => {
    await createFixture(database, 'v1');
    await runMigrations(database, CONTEXT);

    expect(await database.all(
      `SELECT id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
              legacy_recurring, source_template_id, source_due_on, created_at, updated_at
       FROM transactions ORDER BY id`,
    )).toEqual([
      {
        id: 'tx-coffee', ledger_id: CONTEXT.legacyLedgerId, kind: 'expense', amount_minor: 7550,
        category_id: 'groceries', description: 'Café Coffee Shop', occurred_on: '2026-08-02',
        legacy_recurring: 0, source_template_id: null, source_due_on: null,
        created_at: '2026-08-02T09:00:00.000Z', updated_at: '2026-08-02T09:30:00.000Z',
      },
      {
        id: 'tx-income', ledger_id: CONTEXT.legacyLedgerId, kind: 'income', amount_minor: 200000,
        category_id: 'salary', description: 'August Paycheck', occurred_on: '2026-08-01',
        legacy_recurring: 1, source_template_id: null, source_due_on: null,
        created_at: '2026-08-01T08:00:00.000Z', updated_at: '2026-08-01T08:00:00.000Z',
      },
      {
        id: 'tx-rent', ledger_id: CONTEXT.legacyLedgerId, kind: 'expense', amount_minor: 120000,
        category_id: 'housing', description: 'August Rent', occurred_on: '2026-08-03',
        legacy_recurring: 1, source_template_id: null, source_due_on: null,
        created_at: '2026-08-03T10:00:00.000Z', updated_at: '2026-08-03T10:00:00.000Z',
      },
    ]);
    expect(await database.all(
      'SELECT ledger_id, category_id, month, limit_minor, rollover_policy, updated_at FROM budget_plans ORDER BY category_id',
    )).toEqual([
      {
        ledger_id: CONTEXT.legacyLedgerId, category_id: 'groceries', month: '2026-08',
        limit_minor: 50000, rollover_policy: 'none', updated_at: '2026-08-01T11:00:00.000Z',
      },
      {
        ledger_id: CONTEXT.legacyLedgerId, category_id: 'housing', month: '2026-08',
        limit_minor: 150000, rollover_policy: 'none', updated_at: '2026-08-01T12:00:00.000Z',
      },
    ]);
    expect(await database.all('SELECT * FROM recurring_templates')).toEqual([]);
  });

  it('persists one immutable USD ledger across different contexts and no-op reopens', async () => {
    await createFixture(database, 'v1');
    await runMigrations(database, CONTEXT);
    const first = await database.all('SELECT * FROM ledgers');
    await runMigrations(database, SECOND_CONTEXT);
    database.close();
    database = new NodeMigrationAdapter(filename);
    await runMigrations(database, SECOND_CONTEXT);

    expect(await database.all('SELECT * FROM ledgers')).toEqual(first);
    expect(first).toEqual([{
      id: CONTEXT.legacyLedgerId,
      name: 'Personal',
      currency_code: 'USD',
      currency_minor_unit: 2,
      created_at: CONTEXT.nowIso,
      updated_at: CONTEXT.nowIso,
    }]);
  });

  it('creates the exact final schema object counts', async () => {
    await runMigrations(database, CONTEXT);
    expect(await database.first<{ count: number }>(
      `SELECT count(*) AS count FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )).toEqual({ count: 12 });
    expect(await database.first<{ count: number }>(
      `SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger'`,
    )).toEqual({ count: 3 });
    expect(await database.first<{ count: number }>(
      `SELECT count(*) AS count FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`,
    )).toEqual({ count: 7 });
  });

  it.each([
    ['negative version', 'PRAGMA user_version = -1'],
    ['newer version', 'PRAGMA user_version = 5'],
    ['unknown v0 object', 'CREATE TABLE mystery(id TEXT); PRAGMA user_version = 0'],
    ['incompatible v0 table', 'CREATE TABLE transactions(id TEXT PRIMARY KEY); PRAGMA user_version = 0'],
    ['incompatible v1 structure', 'CREATE TABLE transactions(id TEXT PRIMARY KEY); PRAGMA user_version = 1'],
  ])('rejects %s without changing its logical bytes', async (_label, sql) => {
    await database.exec(sql);
    const before = await logicalDigest(database);
    await expect(runMigrations(database, CONTEXT)).rejects.toThrow(/unsupported|incompatible|version/i);
    expect(await logicalDigest(database)).toBe(before);
  });

  it.each(['v1', 'v2', 'v3', 'v4'] as const)(
    'rejects an altered compatible-name frozen %s schema without changing it',
    async (fixture) => {
      await createFixture(database, fixture);
      await alterCompatibleNamedFrozenFixture(database, fixture);
      const before = await logicalDigest(database);
      await expect(runMigrations(database, CONTEXT)).rejects.toThrow(/incompatible|unsupported/i);
      expect(await logicalDigest(database)).toBe(before);
    },
  );

  it('migrates one and max-safe legacy money values exactly', async () => {
    await database.exec(SHIPPED_V1_SQL);
    await database.run(
      `INSERT INTO transactions VALUES(?, 'expense', ?, 'groceries', ?, '2026-08-01', 0, ?, ?)`,
      ['one', 1, 'One', CONTEXT.nowIso, CONTEXT.nowIso],
    );
    await database.run(
      `INSERT INTO transactions VALUES(?, 'expense', ?, 'groceries', ?, '2026-08-02', 0, ?, ?)`,
      ['max', Number.MAX_SAFE_INTEGER, 'Max', CONTEXT.nowIso, CONTEXT.nowIso],
    );
    await database.run('INSERT INTO budgets VALUES(?, ?, ?)', ['one', 1, CONTEXT.nowIso]);
    await database.run('INSERT INTO budgets VALUES(?, ?, ?)', ['max', Number.MAX_SAFE_INTEGER, CONTEXT.nowIso]);
    await runMigrations(database, CONTEXT);
    expect(await database.all('SELECT id, amount_minor FROM transactions ORDER BY id')).toEqual([
      { id: 'max', amount_minor: Number.MAX_SAFE_INTEGER },
      { id: 'one', amount_minor: 1 },
    ]);
    expect(await database.all('SELECT category_id, limit_minor FROM budget_plans ORDER BY category_id')).toEqual([
      { category_id: 'max', limit_minor: Number.MAX_SAFE_INTEGER },
      { category_id: 'one', limit_minor: 1 },
    ]);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['text-stored', 'not-money'],
    ['max-safe-plus-one', 9_007_199_254_740_992],
  ])('rejects invalid legacy transaction money (%s) and rolls back', async (_label, value) => {
    await database.exec(SHIPPED_V1_SQL);
    await database.exec('PRAGMA ignore_check_constraints = ON');
    await database.run(
      `INSERT INTO transactions VALUES(?, 'expense', ?, 'groceries', 'Invalid', '2026-08-01', 0, ?, ?)`,
      ['invalid', value, CONTEXT.nowIso, CONTEXT.nowIso],
    );
    await database.exec('PRAGMA ignore_check_constraints = OFF');
    const before = await logicalDigest(database);
    await expect(runMigrations(database, CONTEXT)).rejects.toThrow(/money|amount/i);
    expect(await logicalDigest(database)).toBe(before);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['text-stored', 'not-money'],
    ['max-safe-plus-one', 9_007_199_254_740_992],
  ])('rejects invalid legacy budget money (%s) and rolls back', async (_label, value) => {
    await database.exec(SHIPPED_V1_SQL);
    await database.exec('PRAGMA ignore_check_constraints = ON');
    await database.run('INSERT INTO budgets VALUES(?, ?, ?)', ['invalid', value, CONTEXT.nowIso]);
    await database.exec('PRAGMA ignore_check_constraints = OFF');
    const before = await logicalDigest(database);
    await expect(runMigrations(database, CONTEXT)).rejects.toThrow(/money|budget/i);
    expect(await logicalDigest(database)).toBe(before);
  });

  it('enforces safe-integer boundaries on every final monetary column', async () => {
    await runMigrations(database, CONTEXT);
    const ledger = CONTEXT.legacyLedgerId;
    const transactionValues = [0, -1, 1.5, 'not-money', 9_007_199_254_740_992] as const;
    for (const [index, value] of transactionValues.entries()) {
      await expect(database.run(
        `INSERT INTO transactions(
          id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
          legacy_recurring, source_template_id, source_due_on, created_at, updated_at
        ) VALUES(?, ?, 'expense', ?, 'groceries', 'Invalid', '2026-08-01', 0, NULL, NULL, ?, ?)`,
        [`invalid-transaction-${index}`, ledger, value, CONTEXT.nowIso, CONTEXT.nowIso],
      )).rejects.toThrow();
    }
    for (const [index, value] of [0, -1, 1.5, 'not-money', 9_007_199_254_740_992].entries()) {
      await expect(database.run(
        `INSERT INTO recurring_templates(
          id, ledger_id, description, category_id, amount_minor, due_day, start_month,
          end_month, enabled, created_at, updated_at
        ) VALUES(?, ?, 'Invalid', 'utilities', ?, 1, '2026-08', NULL, 1, ?, ?)`,
        [`invalid-template-${index}`, ledger, value as number | string, CONTEXT.nowIso, CONTEXT.nowIso],
      )).rejects.toThrow();
      await expect(database.run(
        `INSERT INTO savings_goals(
          id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
        ) VALUES(?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [`invalid-goal-${index}`, ledger, `Invalid ${index}`, value as number | string, CONTEXT.nowIso, CONTEXT.nowIso],
      )).rejects.toThrow();
    }
    await database.run(
      `INSERT INTO savings_goals(
        id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
      ) VALUES('goal', ?, 'Goal', 1, NULL, NULL, ?, ?)`,
      [ledger, CONTEXT.nowIso, CONTEXT.nowIso],
    );
    await database.run(
      `INSERT INTO budget_plans(ledger_id, category_id, month, limit_minor, rollover_policy, updated_at)
       VALUES(?, 'groceries', '2026-08', 0, 'none', ?)`,
      [ledger, CONTEXT.nowIso],
    );
    await database.run(
      `INSERT INTO goal_contributions(id, goal_id, amount_minor, occurred_on, note, created_at)
       VALUES('zero', 'goal', 0, '2026-08-01', '', ?)`,
      [CONTEXT.nowIso],
    );
    await database.run(
      `INSERT INTO goal_contributions(id, goal_id, amount_minor, occurred_on, note, created_at)
       VALUES('max', 'goal', ?, '2026-08-01', '', ?)`,
      [Number.MAX_SAFE_INTEGER, CONTEXT.nowIso],
    );
    for (const [index, value] of [-1, 1.5, 'not-money', 9_007_199_254_740_992].entries()) {
      await expect(database.run(
        `INSERT INTO budget_plans(ledger_id, category_id, month, limit_minor, rollover_policy, updated_at)
         VALUES(?, ?, '2026-09', ?, 'none', ?)`,
        [ledger, `bad-budget-${index}`, value as number | string, CONTEXT.nowIso],
      )).rejects.toThrow();
      await expect(database.run(
        `INSERT INTO goal_contributions(id, goal_id, amount_minor, occurred_on, note, created_at)
         VALUES(?, 'goal', ?, '2026-08-01', '', ?)`,
        [`bad-contribution-${index}`, value as number | string, CONTEXT.nowIso],
      )).rejects.toThrow();
    }
  });

  it('rebuilds legacy FTS before writes and keeps insert, update, delete, integrity, and reopen synchronized', async () => {
    await createFixture(database, 'v1');
    await runMigrations(database, CONTEXT);
    const search = (term: string) => database.all<{ id: string }>(
      `SELECT transactions.id FROM transaction_fts
       JOIN transactions ON transactions.rowid = transaction_fts.rowid
       WHERE transaction_fts MATCH ? ORDER BY transactions.id`,
      [term],
    );
    expect(await search('coffee')).toEqual([{ id: 'tx-coffee' }]);
    await database.run(
      `INSERT INTO transactions(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      ) VALUES('tx-post-migration', ?, 'expense', 450, 'groceries', 'Harbor Bakery',
        '2026-08-04', 0, NULL, NULL, ?, ?)`,
      [CONTEXT.legacyLedgerId, CONTEXT.nowIso, CONTEXT.nowIso],
    );
    expect(await search('bakery')).toEqual([{ id: 'tx-post-migration' }]);
    await database.run(
      'UPDATE transactions SET description = ? WHERE id = ?',
      ['River Market', 'tx-post-migration'],
    );
    expect(await search('bakery')).toEqual([]);
    expect(await search('river')).toEqual([{ id: 'tx-post-migration' }]);
    await database.run('DELETE FROM transactions WHERE id = ?', ['tx-post-migration']);
    expect(await search('river')).toEqual([]);
    await database.run('UPDATE transactions SET description = ? WHERE id = ?', ['Neighborhood Roastery', 'tx-coffee']);
    expect(await search('coffee')).toEqual([]);
    expect(await search('roastery')).toEqual([{ id: 'tx-coffee' }]);
    await database.run('DELETE FROM transactions WHERE id = ?', ['tx-coffee']);
    expect(await search('roastery')).toEqual([]);
    expect(await database.first(
      `SELECT (SELECT count(*) FROM transactions) AS content_count,
              (SELECT count(*) FROM transaction_fts) AS fts_count`,
    )).toEqual({ content_count: 2, fts_count: 2 });
    await expect(database.exec(
      "INSERT INTO transaction_fts(transaction_fts) VALUES('integrity-check')",
    )).resolves.toBeUndefined();
    database.close();
    database = new NodeMigrationAdapter(filename);
    await runMigrations(database, SECOND_CONTEXT);
    expect(await database.all(
      `SELECT transactions.id FROM transaction_fts
       JOIN transactions ON transactions.rowid = transaction_fts.rowid
       WHERE transaction_fts MATCH 'rent'`,
    )).toEqual([{ id: 'tx-rent' }]);
  });

  it.each([
    'INSERT INTO ledgers',
    'CREATE TABLE transactions_v2',
    'INSERT INTO transactions_v2',
    'DROP TABLE transactions',
    'CREATE INDEX transactions_ledger_order',
    'CREATE VIRTUAL TABLE transaction_fts',
    'CREATE TRIGGER transactions_fts_insert',
    "VALUES('rebuild')",
    'PRAGMA user_version = 2',
    'CREATE TABLE recurring_templates',
    'PRAGMA user_version = 3',
    'CREATE TABLE budget_plans',
    'INSERT INTO budget_plans',
    'DROP TABLE budgets',
    'CREATE TABLE savings_goals',
    'PRAGMA user_version = 4',
  ])('rolls back schema, identity, version, and content when failure occurs after %s', async (needle) => {
    await createFixture(database, 'v1');
    const before = await logicalDigest(database);
    await expect(runMigrations(failureAfter(database, needle), CONTEXT)).rejects.toThrow('Injected after');
    expect(await logicalDigest(database)).toBe(before);
    expect(await database.first('PRAGMA user_version')).toEqual({ user_version: 1 });
  });

  it('single-flights concurrent initialization into exactly one ledger at v4', async () => {
    await Promise.all([
      runMigrations(database, CONTEXT),
      runMigrations(database, SECOND_CONTEXT),
    ]);
    expect(await database.first('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect(await database.all<{ id: string }>('SELECT id FROM ledgers')).toEqual([
      { id: CONTEXT.legacyLedgerId },
    ]);
  });

  it('uses transactions_ledger_order for the first page query', async () => {
    await createFixture(database, 'v1');
    await runMigrations(database, CONTEXT);
    const plan = await database.all<{ detail: string }>(
      `EXPLAIN QUERY PLAN
       SELECT * FROM transactions
       WHERE ledger_id = ?
       ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT 50`,
      [CONTEXT.legacyLedgerId],
    );
    expect(plan.map((row) => row.detail).join('\n')).toContain('transactions_ledger_order');
  });

  it('wires repository initialization through v4 without changing legacy public reads', async () => {
    await createFixture(database, 'v1');
    const repository = new SQLiteFinanceRepository(
      expoDatabaseFrom(database) as never,
      CONTEXT,
    );
    await repository.initialize();

    expect(await database.first('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect((await repository.listTransactions()).map((transaction) => transaction.id)).toEqual([
      'tx-rent',
      'tx-coffee',
      'tx-income',
    ]);
    expect(await repository.listBudgets()).toEqual([
      {
        categoryId: 'groceries',
        limitCents: 50000,
        updatedAt: '2026-08-01T11:00:00.000Z',
      },
      {
        categoryId: 'housing',
        limitCents: 150000,
        updatedAt: '2026-08-01T12:00:00.000Z',
      },
    ]);
  });

  it('deletes every ledger-owned finance row atomically without SET NULL residue', async () => {
    const repository = new SQLiteFinanceRepository(expoDatabaseFrom(database) as never, CONTEXT);
    await repository.initialize();
    await seedEveryFinanceTable(database, CONTEXT.legacyLedgerId);

    await repository.deleteAll();

    expect(await financeRowCounts(database)).toEqual({
      transactions: 0,
      budget_plans: 0,
      recurring_templates: 0,
      expected_occurrences: 0,
      savings_goals: 0,
      goal_contributions: 0,
    });
    expect(await database.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rolls back complete deletion when a later lifecycle delete fails', async () => {
    const source = expoDatabaseFrom(database);
    const repository = new SQLiteFinanceRepository(source as never, CONTEXT);
    await repository.initialize();
    await seedEveryFinanceTable(database, CONTEXT.legacyLedgerId);
    const before = await logicalDigest(database);
    const originalRun = source.runAsync as (
      sql: string,
      ...params: readonly unknown[]
    ) => Promise<unknown>;
    source.runAsync = async (sql: string, ...params: readonly unknown[]) => {
      const result = await originalRun(sql, ...params);
      if (sql.includes('DELETE FROM recurring_templates')) {
        throw new Error('Injected lifecycle deletion failure.');
      }
      return result;
    };

    await expect(repository.deleteAll()).rejects.toThrow('Injected lifecycle deletion failure');
    expect(await logicalDigest(database)).toBe(before);
  });

  it('replaces the complete finance lifecycle while preserving the snapshot contract', async () => {
    let clock = new Date(2026, 8, 1, 12, 0, 0);
    const repository = new SQLiteFinanceRepository(
      expoDatabaseFrom(database) as never,
      CONTEXT,
      () => clock,
    );
    await repository.initialize();
    await seedEveryFinanceTable(database, CONTEXT.legacyLedgerId);
    await repository.replaceAll({
      transactions: [{
        id: 'replacement-tx',
        kind: 'expense',
        amountCents: 3200,
        categoryId: 'groceries',
        description: 'Replacement',
        occurredOn: '2026-09-01',
        isRecurring: false,
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
      }],
      budgets: [{
        categoryId: 'groceries',
        limitCents: 64000,
        updatedAt: '2026-09-01T12:00:00.000Z',
      }],
    });

    expect(await financeRowCounts(database)).toEqual({
      transactions: 1,
      budget_plans: 1,
      recurring_templates: 0,
      expected_occurrences: 0,
      savings_goals: 0,
      goal_contributions: 0,
    });
    expect(await database.all('SELECT id FROM transactions')).toEqual([{ id: 'replacement-tx' }]);
    expect(await database.all('SELECT category_id, month, limit_minor FROM budget_plans')).toEqual([{
      category_id: 'groceries',
      month: '2026-09',
      limit_minor: 64000,
    }]);
    clock = new Date(2026, 8, 2, 12, 0, 0);
  });

  it('derives the active local budget month per operation across an open-app month boundary', async () => {
    let clock = new Date(2026, 7, 31, 23, 59, 59);
    const repository = new SQLiteFinanceRepository(
      expoDatabaseFrom(database) as never,
      CONTEXT,
      () => clock,
    );
    await repository.initialize();
    await repository.setBudget('groceries', 50000);
    expect((await repository.listBudgets()).map((budget) => budget.categoryId)).toEqual(['groceries']);

    clock = new Date(2026, 8, 1, 0, 0, 1);
    expect(await repository.listBudgets()).toEqual([]);
    await repository.setBudget('housing', 150000);
    expect((await repository.listBudgets()).map((budget) => budget.categoryId)).toEqual(['housing']);

    clock = new Date(2026, 7, 31, 23, 59, 59);
    expect((await repository.listBudgets()).map((budget) => budget.categoryId)).toEqual(['groceries']);
  });
});
