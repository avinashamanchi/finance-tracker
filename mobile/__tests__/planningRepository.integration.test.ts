import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runMigrations } from '../src/data/migrations';
import { SQLitePlanningRepository } from '../src/data/planningRepository';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const LEDGER_ID = '11111111-1111-4111-8111-111111111111';

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'finova-planning-'));
  const database = new NodeMigrationAdapter(join(directory, 'ledger.db'));
  await runMigrations(database, {
    legacyLedgerId: LEDGER_ID,
    currentMonth: '2026-08',
    nowIso: '2026-08-07T12:00:00.000Z',
  });
  const repository = new SQLitePlanningRepository(database, LEDGER_ID, {
    now: () => new Date('2026-08-07T12:00:00.000Z'),
    createId: () => '44444444-4444-4444-8444-444444444444',
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

describe('planning repository', () => {
  it('derives non-compounding carry from adjacent plans and current SQL spending', async () => {
    const test = await fixture();
    try {
      await test.repository.setBudgetPlan({
        ledgerId: LEDGER_ID,
        categoryId: 'groceries',
        month: '2026-07',
        limitMinor: 50_000,
        rolloverPolicy: 'carry_unused',
      });
      await test.database.run(`INSERT INTO transactions(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      ) VALUES (?, ?, 'expense', 42000, 'groceries', 'Food', '2026-07-10', 0, NULL, NULL, ?, ?)`, [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        LEDGER_ID,
        '2026-07-10T12:00:00.000Z',
        '2026-07-10T12:00:00.000Z',
      ]);
      await test.repository.setBudgetPlan({
        ledgerId: LEDGER_ID,
        categoryId: 'groceries',
        month: '2026-08',
        limitMinor: 50_000,
        rolloverPolicy: 'carry_unused',
      });
      expect(await test.repository.getBudgetUsage(LEDGER_ID, 'groceries', '2026-08'))
        .toEqual({ baseMinor: 50_000, carryMinor: 8_000, spentMinor: 0, availableMinor: 58_000, remainingMinor: 58_000 });
    } finally {
      test.close();
    }
  });

  it('keeps goal contributions idempotent and exact', async () => {
    const test = await fixture();
    try {
      const goal = await test.repository.createGoal({
        id: '55555555-5555-4555-8555-555555555555',
        ledgerId: LEDGER_ID,
        name: 'Emergency fund',
        targetMinor: 300_000,
        targetOn: null,
      });
      const contribution = {
        id: '66666666-6666-4666-8666-666666666666',
        goalId: goal.id,
        amountMinor: 25_000,
        occurredOn: '2026-08-07',
        note: 'Recorded transfer',
      };
      await test.repository.addGoalContribution(contribution);
      await test.repository.addGoalContribution(contribution);
      expect(await test.repository.getGoalProgress(goal.id)).toEqual({
        recordedMinor: 25_000,
        remainingMinor: 275_000,
        percent: 8.3,
      });
    } finally {
      test.close();
    }
  });
});
