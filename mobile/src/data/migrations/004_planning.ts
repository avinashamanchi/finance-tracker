import type { Migration } from './types';

const MAX_SAFE_SQLITE_INTEGER = 9_007_199_254_740_991;

export const planningMigration: Migration = {
  version: 4,
  name: 'budgets_and_savings_goals',
  async up(database, context) {
    const invalidBudgets = await database.first<{ count: number }>(`
      SELECT count(*) AS count FROM budgets
      WHERE typeof(limit_cents) != 'integer'
         OR limit_cents < 1
         OR limit_cents > ${MAX_SAFE_SQLITE_INTEGER}
    `);
    if (invalidBudgets?.count !== 0) {
      throw new Error('Legacy budget money is outside the supported safe-integer range.');
    }

    await database.exec(`
      CREATE TABLE budget_plans (
        ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL,
        month TEXT NOT NULL,
        limit_minor INTEGER NOT NULL CHECK(
          typeof(limit_minor) = 'integer'
          AND limit_minor BETWEEN 0 AND ${MAX_SAFE_SQLITE_INTEGER}
        ),
        rollover_policy TEXT NOT NULL DEFAULT 'none'
          CHECK(rollover_policy IN ('none','carry_unused')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(ledger_id, category_id, month)
      );
      CREATE INDEX budget_plans_ledger_month
        ON budget_plans(ledger_id, month, category_id);
    `);
    await database.run(`
      INSERT INTO budget_plans(
        ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
      )
      SELECT ledgers.id, budgets.category_id, ?, budgets.limit_cents, 'none', budgets.updated_at
      FROM budgets
      CROSS JOIN (SELECT id FROM ledgers ORDER BY rowid LIMIT 1) AS ledgers
    `, [context.currentMonth]);
    await database.exec('DROP TABLE budgets');
    await database.exec(`
      CREATE TABLE savings_goals (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
        target_minor INTEGER NOT NULL CHECK(
          typeof(target_minor) = 'integer'
          AND target_minor BETWEEN 1 AND ${MAX_SAFE_SQLITE_INTEGER}
        ),
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
        amount_minor INTEGER NOT NULL CHECK(
          typeof(amount_minor) = 'integer'
          AND amount_minor BETWEEN 0 AND ${MAX_SAFE_SQLITE_INTEGER}
        ),
        occurred_on TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX goal_contributions_goal_order
        ON goal_contributions(goal_id, occurred_on DESC, created_at DESC, id DESC);
    `);
  },
};
