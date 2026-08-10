import { createHash } from 'node:crypto';

import type { MigrationDatabase } from '../data/migrations';

export type LargeLedgerFixtureOptions = Readonly<{
  seed: string;
  transactions: number;
  months: number;
  budgets: number;
  templates: number;
  goals: number;
}>;

export type LargeLedgerFixture = LargeLedgerFixtureOptions & Readonly<{
  digest: `sha256:${string}`;
  algorithmVersion: 1;
}>;

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} is outside the deterministic fixture bound.`);
  }
  return value;
}

export function buildLargeLedgerFixture(options: LargeLedgerFixtureOptions): LargeLedgerFixture {
  if (!/^[a-z0-9-]{1,64}$/i.test(options.seed)) throw new Error('Fixture seed is invalid.');
  const canonical = {
    algorithmVersion: 1 as const,
    seed: options.seed,
    transactions: boundedInteger(options.transactions, 1, 100_000, 'Transaction count'),
    months: boundedInteger(options.months, 1, 120, 'Month count'),
    budgets: boundedInteger(options.budgets, 0, 2_160, 'Budget count'),
    templates: boundedInteger(options.templates, 0, 1_000, 'Template count'),
    goals: boundedInteger(options.goals, 0, 1_000, 'Goal count'),
  };
  const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return Object.freeze({ ...canonical, digest: `sha256:${digest}` });
}

function requireLedgerId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('Fixture ledger ID must be a canonical UUID v4.');
  }
  return value;
}

export async function installLargeLedgerFixture(
  database: MigrationDatabase,
  ledgerId: string,
  fixture: LargeLedgerFixture,
): Promise<void> {
  const owner = requireLedgerId(ledgerId);
  await database.exclusive(async (transaction) => {
    await transaction.run(`
      WITH RECURSIVE numbers(value) AS (
        VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < ?
      )
      INSERT INTO transactions(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      )
      SELECT
        printf('10000000-0000-4000-8000-%012d', value),
        ?,
        CASE WHEN value % 5 = 0 THEN 'income' ELSE 'expense' END,
        (value % 500000) + 1,
        CASE
          WHEN value % 5 = 0 THEN 'salary'
          WHEN value % 4 = 0 THEN 'groceries'
          WHEN value % 4 = 1 THEN 'transport'
          WHEN value % 4 = 2 THEN 'utilities'
          ELSE 'dining'
        END,
        CASE WHEN value % 7 = 0 THEN 'Market purchase' ELSE 'Fixture entry' END,
        date('2026-08-15', printf('-%d months', (value - 1) % ?)),
        0, NULL, NULL,
        date('2026-08-15', printf('-%d months', (value - 1) % ?)) || 'T12:00:00.000Z',
        date('2026-08-15', printf('-%d months', (value - 1) % ?)) || 'T12:00:00.000Z'
      FROM numbers
    `, [fixture.transactions, owner, fixture.months, fixture.months, fixture.months]);

    if (fixture.budgets > 0) {
      await transaction.run(`
        WITH RECURSIVE numbers(value) AS (
          VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < ?
        )
        INSERT INTO budget_plans(ledger_id, category_id, month, limit_minor, rollover_policy, updated_at)
        SELECT ?,
          CASE (value - 1) % 18
            WHEN 0 THEN 'housing' WHEN 1 THEN 'utilities' WHEN 2 THEN 'groceries'
            WHEN 3 THEN 'dining' WHEN 4 THEN 'transport' WHEN 5 THEN 'health'
            WHEN 6 THEN 'insurance' WHEN 7 THEN 'subscriptions' WHEN 8 THEN 'shopping'
            WHEN 9 THEN 'entertainment' WHEN 10 THEN 'education' WHEN 11 THEN 'travel'
            WHEN 12 THEN 'gifts' WHEN 13 THEN 'childcare' WHEN 14 THEN 'pets'
            WHEN 15 THEN 'taxes' WHEN 16 THEN 'debt' ELSE 'other_expense'
          END,
          strftime('%Y-%m', date('2026-08-01', printf('-%d months', (value - 1) / 18))),
          10000 + value,
          CASE WHEN value % 2 = 0 THEN 'carry_unused' ELSE 'none' END,
          '2026-08-10T00:00:00.000Z'
        FROM numbers
      `, [fixture.budgets, owner]);
    }

    if (fixture.templates > 0) {
      await transaction.run(`
        WITH RECURSIVE numbers(value) AS (
          VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < ?
        )
        INSERT INTO recurring_templates(
          id, ledger_id, description, category_id, amount_minor, due_day,
          start_month, end_month, enabled, created_at, updated_at
        )
        SELECT printf('20000000-0000-4000-8000-%012d', value), ?,
          'Fixture recurring bill', 'utilities', 5000 + value, ((value - 1) % 28) + 1,
          '2026-01', NULL, 1, '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'
        FROM numbers
      `, [fixture.templates, owner]);
    }

    if (fixture.goals > 0) {
      await transaction.run(`
        WITH RECURSIVE numbers(value) AS (
          VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < ?
        )
        INSERT INTO savings_goals(
          id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
        )
        SELECT printf('30000000-0000-4000-8000-%012d', value), ?,
          printf('Fixture savings goal %d', value), 100000 + value, NULL, NULL,
          '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'
        FROM numbers
      `, [fixture.goals, owner]);
    }
  });
}
