import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataBoundaryError, LedgerCapacityError, MoneyRangeError } from '../src/domain/errors';
import { getMonthSummary, getSixMonthTrend } from '../src/data/aggregateQueries';
import { runMigrations } from '../src/data/migrations';
import type { MigrationContext } from '../src/data/migrations/types';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const context: MigrationContext = {
  legacyLedgerId: '10000000-0000-4000-8000-000000000001',
  currentMonth: '2026-08',
  nowIso: '2026-08-07T00:00:00.000Z',
};

describe('bounded exact aggregate queries', () => {
  let database: NodeMigrationAdapter;
  let directory: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'finova-aggregate-query-'));
    database = new NodeMigrationAdapter(join(directory, 'finova.sqlite'));
    await runMigrations(database, context);
  });
  afterEach(() => {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  });

  async function insert(id: string, kind: 'income' | 'expense', amount: number, month = '2026-08') {
    await database.run(
      `INSERT INTO transactions(
         id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
         legacy_recurring, source_template_id, source_due_on, created_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, 'Fixture', ?, 0, NULL, NULL, ?, ?)`,
      [
        id, context.legacyLedgerId, kind, amount, kind === 'income' ? 'salary' : 'groceries',
        `${month}-01`, `${month}-01T00:00:00.000Z`, `${month}-01T00:00:00.000Z`,
      ],
    );
  }

  it('reconstructs an exact maximum-safe total without raw SQLite SUM overflow', async () => {
    await insert('max', 'income', Number.MAX_SAFE_INTEGER);
    await expect(getMonthSummary(database, context.legacyLedgerId, '2026-08')).resolves.toMatchObject({
      incomeMinor: Number.MAX_SAFE_INTEGER,
      expenseMinor: 0,
      balanceMinor: Number.MAX_SAFE_INTEGER,
    });
  });

  it('translates mathematically unsafe totals into a content-free typed error', async () => {
    await insert('one', 'income', Number.MAX_SAFE_INTEGER);
    await insert('two', 'income', 1);
    await expect(getMonthSummary(database, context.legacyLedgerId, '2026-08'))
      .rejects.toEqual(new MoneyRangeError());
  });

  it('survives a fixture for which raw SQLite SUM itself overflows', async () => {
    await insert('one', 'income', Number.MAX_SAFE_INTEGER);
    await insert('two', 'income', Number.MAX_SAFE_INTEGER);
    await expect(database.first('SELECT SUM(amount_minor) AS total FROM transactions')).rejects.toThrow();
    await expect(getMonthSummary(database, context.legacyLedgerId, '2026-08'))
      .rejects.toBeInstanceOf(MoneyRangeError);
  });

  it('checks the global ledger cap even when the selected month is small', async () => {
    await database.exec(`
      WITH RECURSIVE numbers(value) AS (
        VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < 100001
      )
      INSERT INTO transactions(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      ) SELECT printf('bulk-%06d', value), '${context.legacyLedgerId}', 'expense', 1,
        'groceries', 'Bulk', '2020-01-01', 0, NULL, NULL,
        '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z' FROM numbers;
    `);
    await expect(getMonthSummary(database, context.legacyLedgerId, '2026-08'))
      .rejects.toEqual(new LedgerCapacityError());
  });

  it('zero-fills six strict months and checks exact cross-month values', async () => {
    await insert('march', 'income', 100, '2026-03');
    await insert('august', 'expense', 50, '2026-08');
    const points = await getSixMonthTrend(database, context.legacyLedgerId, '2026-08');
    expect(points).toHaveLength(6);
    expect(points[0]).toMatchObject({ month: '2026-03', incomeMinor: 100 });
    expect(points[5]).toMatchObject({ month: '2026-08', expenseMinor: 50 });
  });

  it('rejects unknown aggregate categories at the data boundary', async () => {
    await database.run(
      `INSERT INTO transactions(
         id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
         legacy_recurring, source_template_id, source_due_on, created_at, updated_at
       ) VALUES('unknown-category', ?, 'expense', 1, 'mystery', 'Fixture', '2026-08-01',
         0, NULL, NULL, ?, ?)`,
      [context.legacyLedgerId, context.nowIso, context.nowIso],
    );
    await expect(getMonthSummary(database, context.legacyLedgerId, '2026-08'))
      .rejects.toBeInstanceOf(DataBoundaryError);
    await expect(getSixMonthTrend(database, context.legacyLedgerId, '2026-08'))
      .rejects.toBeInstanceOf(DataBoundaryError);
  });
});
