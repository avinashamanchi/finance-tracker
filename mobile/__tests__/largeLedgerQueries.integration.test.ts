import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getMonthSummary } from '../src/data/aggregateQueries';
import { runMigrations } from '../src/data/migrations';
import { TransactionQueryService } from '../src/data/transactionQueries';
import { buildLargeLedgerFixture, installLargeLedgerFixture } from '../src/testing/largeLedgerFixture';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const ledgerId = '90000000-0000-4000-8000-000000000001';
const fixtureOptions = {
  seed: 'finova-25k-v1',
  transactions: 100_000,
  months: 120,
  budgets: 180,
  templates: 120,
  goals: 50,
} as const;

describe('100k local ledger boundary', () => {
  jest.setTimeout(120_000);

  it('is deterministic, bounded, indexed, searchable, and exactly aggregatable', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'finova-large-ledger-'));
    const database = new NodeMigrationAdapter(join(directory, 'finova.sqlite'));
    try {
      const fixture = buildLargeLedgerFixture(fixtureOptions);
      const repeat = buildLargeLedgerFixture(fixtureOptions);
      expect(fixture.digest).toBe('sha256:4f3628d6e2b35a8bd282486b0089fef2a0fa83bf0139e57fad96250b309e1c09');
      expect(repeat.digest).toBe(fixture.digest);
      await runMigrations(database, {
        legacyLedgerId: ledgerId,
        currentMonth: '2026-08',
        nowIso: '2026-08-10T00:00:00.000Z',
      });
      await installLargeLedgerFixture(database, ledgerId, fixture);

      expect(await database.first('SELECT COUNT(*) AS count FROM transactions')).toEqual({ count: 100_000 });
      expect(await database.first('SELECT COUNT(*) AS count FROM budget_plans')).toEqual({ count: 180 });
      expect(await database.first('SELECT COUNT(*) AS count FROM recurring_templates')).toEqual({ count: 120 });
      expect(await database.first('SELECT COUNT(*) AS count FROM savings_goals')).toEqual({ count: 50 });

      const digest = async (value: string) => createHash('sha256').update(value).digest('hex');
      const service = new TransactionQueryService(database, { salt: 'large-ledger-gate', digest });
      const base = { ledgerId, limit: 50 as const, kinds: [], search: '' };
      const first = await service.listTransactionsPage(base);
      expect(first.items).toHaveLength(50);
      expect(first.hasOlder).toBe(true);
      expect(first.olderCursor).not.toBeNull();
      const older = await service.listTransactionsPage({ ...base, cursor: first.olderCursor! });
      expect(older.items).toHaveLength(50);
      expect(new Set([...first.items, ...older.items].map((item) => item.id)).size).toBe(100);

      const search = await service.listTransactionsPage({ ...base, search: 'market' });
      expect(search.items).toHaveLength(50);
      const plan = (await service.explain(base)).join(' ');
      const searchPlan = (await service.explain({ ...base, search: 'market' })).join(' ');
      expect(plan).toMatch(/transactions_ledger_order/i);
      expect(searchPlan).toMatch(/transaction_fts/i);

      const summary = await getMonthSummary(database, ledgerId, '2026-08');
      expect(summary.transactionCount).toBeGreaterThan(800);
      expect(Number.isSafeInteger(summary.incomeMinor)).toBe(true);
      expect(Number.isSafeInteger(summary.expenseMinor)).toBe(true);
      expect(await database.all('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      database.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
