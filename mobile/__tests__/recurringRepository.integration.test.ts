import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SQLiteRecurringRepository } from '../src/data/recurringRepository';
import { runMigrations } from '../src/data/migrations';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const LEDGER_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'finova-recurring-'));
  const database = new NodeMigrationAdapter(join(directory, 'ledger.db'));
  await runMigrations(database, {
    legacyLedgerId: LEDGER_ID,
    currentMonth: '2026-08',
    nowIso: '2026-08-07T12:00:00.000Z',
  });
  let nextId = 0;
  const ids = [
    '33333333-3333-4333-8333-333333333331',
    '33333333-3333-4333-8333-333333333332',
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333334',
    '33333333-3333-4333-8333-333333333335',
  ];
  const repository = new SQLiteRecurringRepository(database, LEDGER_ID, {
    now: () => new Date('2026-08-07T12:00:00.000Z'),
    createId: () => ids[nextId++] ?? '33333333-3333-4333-8333-333333333399',
  });
  return {
    database,
    repository,
    close() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

describe('recurring repository', () => {
  it('materializes idempotently, reconciles edits, and never posts spending automatically', async () => {
    const test = await fixture();
    try {
      const created = await test.repository.upsertTemplate({
        id: TEMPLATE_ID,
        ledgerId: LEDGER_ID,
        description: 'Rent',
        categoryId: 'housing',
        amountMinor: 250_000,
        dueDay: 31,
        startMonth: '2026-08',
        endMonth: null,
        enabled: true,
      });
      expect(await test.repository.getTemplate(TEMPLATE_ID)).toEqual(created);
      expect(await test.repository.getTemplate('99999999-9999-4999-8999-999999999999')).toBeNull();
      await test.repository.materializeExpectedOccurrences('2026-08-07');
      await test.repository.materializeExpectedOccurrences('2026-08-07');
      expect(await test.repository.listExpectedBills('2026-08-01', '2026-10-31', '2026-08-07'))
        .toHaveLength(3);
      expect(await test.database.first<{ count: number }>('SELECT count(*) AS count FROM transactions'))
        .toEqual({ count: 0 });

      await test.repository.upsertTemplate({
        id: TEMPLATE_ID,
        ledgerId: LEDGER_ID,
        description: 'Updated rent',
        categoryId: 'housing',
        amountMinor: 255_000,
        dueDay: 15,
        startMonth: '2026-08',
        endMonth: null,
        enabled: true,
      });
      const dates = (await test.repository.listExpectedBills(
        '2026-08-01',
        '2026-10-31',
        '2026-08-07',
      )).map((item) => item.dueOn);
      expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
    } finally {
      test.close();
    }
  });

  it('records an expected bill atomically and replays the same transaction ID', async () => {
    const test = await fixture();
    try {
      await test.repository.upsertTemplate({
        id: TEMPLATE_ID,
        ledgerId: LEDGER_ID,
        description: 'Rent',
        categoryId: 'housing',
        amountMinor: 250_000,
        dueDay: 10,
        startMonth: '2026-08',
        endMonth: '2026-08',
        enabled: true,
      });
      await test.repository.materializeExpectedOccurrences('2026-08-07');
      const [bill] = await test.repository.listExpectedBills(
        '2026-08-01',
        '2026-08-31',
        '2026-08-07',
      );
      const first = await test.repository.recordExpectedBill(bill.id, {
        transactionId: TRANSACTION_ID,
        occurredOn: '2026-08-10',
      });
      const replay = await test.repository.recordExpectedBill(bill.id, {
        transactionId: TRANSACTION_ID,
        occurredOn: '2026-08-10',
      });
      expect(replay).toEqual(first);
      expect(await test.database.first<{ count: number }>('SELECT count(*) AS count FROM transactions'))
        .toEqual({ count: 1 });
      await expect(test.repository.recordExpectedBill(bill.id, {
        transactionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        occurredOn: '2026-08-10',
      })).rejects.toThrow('different transaction');
    } finally {
      test.close();
    }
  });
});
