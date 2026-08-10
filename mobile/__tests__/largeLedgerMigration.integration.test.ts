import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LATEST_SCHEMA_VERSION, runMigrations } from '../src/data/migrations';
import { TransactionQueryService } from '../src/data/transactionQueries';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const ledgerId = '90000000-0000-4000-8000-000000000001';
const context = {
  legacyLedgerId: ledgerId,
  currentMonth: '2026-08',
  nowIso: '2026-08-10T00:00:00.000Z',
} as const;

async function installFrozenV1(database: NodeMigrationAdapter): Promise<void> {
  await database.exec(`
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category_id TEXT NOT NULL,
      description TEXT NOT NULL,
      occurred_on TEXT NOT NULL,
      is_recurring INTEGER NOT NULL CHECK (is_recurring IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX transactions_occurred_on ON transactions(occurred_on DESC, created_at DESC);
    CREATE TABLE budgets (
      category_id TEXT PRIMARY KEY NOT NULL,
      limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
      updated_at TEXT NOT NULL
    );
    PRAGMA user_version = 1;
  `);
  await database.run(`
    WITH RECURSIVE numbers(value) AS (
      VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < 100000
    )
    INSERT INTO transactions(
      id, kind, amount_cents, category_id, description, occurred_on,
      is_recurring, created_at, updated_at
    )
    SELECT printf('10000000-0000-4000-8000-%012d', value),
      CASE WHEN value % 5 = 0 THEN 'income' ELSE 'expense' END,
      (value % 500000) + 1,
      CASE
        WHEN value % 5 = 0 THEN 'salary'
        WHEN value % 4 = 0 THEN 'groceries'
        WHEN value % 4 = 1 THEN 'transport'
        WHEN value % 4 = 2 THEN 'utilities'
        ELSE 'dining'
      END,
      CASE WHEN value % 7 = 0 THEN 'Market purchase' ELSE 'Frozen v1 entry' END,
      date('2026-08-15', printf('-%d months', (value - 1) % 120)),
      0,
      date('2026-08-15', printf('-%d months', (value - 1) % 120)) || 'T12:00:00.000Z',
      date('2026-08-15', printf('-%d months', (value - 1) % 120)) || 'T12:00:00.000Z'
    FROM numbers
  `);
  await database.exec(`
    INSERT INTO budgets(category_id, limit_cents, updated_at) VALUES
      ('housing', 100000, '2026-08-10T00:00:00.000Z'),
      ('utilities', 20000, '2026-08-10T00:00:00.000Z'),
      ('groceries', 40000, '2026-08-10T00:00:00.000Z'),
      ('dining', 25000, '2026-08-10T00:00:00.000Z');
  `);
}

async function contentDigest(database: NodeMigrationAdapter, amountColumn: 'amount_cents' | 'amount_minor') {
  const value = await database.first<Record<string, string | number>>(`
    SELECT COUNT(*) AS count, MIN(id) AS minimum_id, MAX(id) AS maximum_id,
      SUM(${amountColumn}) AS amount_total, MIN(occurred_on) AS first_date,
      MAX(occurred_on) AS last_date FROM transactions
  `);
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('100k frozen-v1 migration gate', () => {
  jest.setTimeout(120_000);

  it('preserves content, rebuilds search, passes integrity, reopens, and is idempotent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'finova-large-migration-'));
    const filename = join(directory, 'finova.sqlite');
    let database = new NodeMigrationAdapter(filename);
    try {
      await installFrozenV1(database);
      const before = await contentDigest(database, 'amount_cents');
      await runMigrations(database, context);
      const after = await contentDigest(database, 'amount_minor');
      expect(after).toBe(before);
      expect(await database.first('PRAGMA user_version')).toEqual({ user_version: LATEST_SCHEMA_VERSION });
      expect(await database.first('SELECT COUNT(*) AS count FROM transactions')).toEqual({ count: 100_000 });
      expect(await database.first('SELECT COUNT(*) AS count FROM budget_plans')).toEqual({ count: 4 });
      expect(await database.all('PRAGMA foreign_key_check')).toEqual([]);
      expect(await database.first(
        "SELECT COUNT(*) AS count FROM transaction_fts WHERE transaction_fts MATCH 'market'",
      )).toEqual({ count: 14_285 });

      const digest = async (value: string) => createHash('sha256').update(value).digest('hex');
      const service = new TransactionQueryService(database, { salt: 'migrated-large-ledger', digest });
      const search = await service.listTransactionsPage({ ledgerId, limit: 50, kinds: [], search: 'market' });
      expect(search.items).toHaveLength(50);

      database.close();
      database = new NodeMigrationAdapter(filename);
      const reopened = await contentDigest(database, 'amount_minor');
      expect(reopened).toBe(after);
      await runMigrations(database, context);
      expect(await contentDigest(database, 'amount_minor')).toBe(after);
      expect(await database.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally {
      database.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
