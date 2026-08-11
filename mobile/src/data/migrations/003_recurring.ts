import type { Migration } from './types';

const MAX_SAFE_SQLITE_INTEGER = 9_007_199_254_740_991;

export const recurringMigration: Migration = {
  version: 3,
  name: 'recurring_planning',
  async up(database) {
    await database.exec(`
      CREATE TABLE recurring_templates (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 120),
        category_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK(
          typeof(amount_minor) = 'integer'
          AND amount_minor BETWEEN 1 AND ${MAX_SAFE_SQLITE_INTEGER}
        ),
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
    `);
  },
};
