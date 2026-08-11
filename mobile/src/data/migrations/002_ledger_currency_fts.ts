import type { Migration } from './types';

const MAX_SAFE_SQLITE_INTEGER = 9_007_199_254_740_991;

export const ledgerCurrencyFtsMigration: Migration = {
  version: 2,
  name: 'ledger_currency_and_search',
  async up(database, context) {
    const invalidTransactions = await database.first<{ count: number }>(`
      SELECT count(*) AS count FROM transactions
      WHERE typeof(amount_cents) != 'integer'
         OR amount_cents < 1
         OR amount_cents > ${MAX_SAFE_SQLITE_INTEGER}
    `);
    if (invalidTransactions?.count !== 0) {
      throw new Error('Legacy transaction money is outside the supported safe-integer range.');
    }
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
      CREATE TABLE ledgers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
        currency_code TEXT NOT NULL CHECK(currency_code GLOB '[A-Z][A-Z][A-Z]'),
        currency_minor_unit INTEGER NOT NULL CHECK(currency_minor_unit BETWEEN 0 AND 3),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await database.run(
      `INSERT INTO ledgers(id, name, currency_code, currency_minor_unit, created_at, updated_at)
       VALUES(?, 'Personal', 'USD', 2, ?, ?)`,
      [context.legacyLedgerId, context.nowIso, context.nowIso],
    );

    await database.exec(`
      CREATE TABLE transactions_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
        amount_minor INTEGER NOT NULL CHECK(
          typeof(amount_minor) = 'integer'
          AND amount_minor BETWEEN 1 AND ${MAX_SAFE_SQLITE_INTEGER}
        ),
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
    `);
    await database.run(`
      INSERT INTO transactions_v2(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      )
      SELECT id, ?, kind, amount_cents, category_id, description, occurred_on,
             is_recurring, NULL, NULL, created_at, updated_at
      FROM transactions
    `, [context.legacyLedgerId]);
    await database.exec(`
      DROP TABLE transactions;
      ALTER TABLE transactions_v2 RENAME TO transactions;
    `);
    await database.exec(`
      CREATE INDEX transactions_ledger_order
        ON transactions(ledger_id, occurred_on DESC, created_at DESC, id DESC);
      CREATE INDEX transactions_ledger_month_kind
        ON transactions(ledger_id, occurred_on, kind, category_id);
    `);
    await database.exec(`
      CREATE VIRTUAL TABLE transaction_fts USING fts5(
        description,
        category_id,
        content='transactions',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
    await database.exec(`
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
    `);
    await database.exec(
      "INSERT INTO transaction_fts(transaction_fts) VALUES('rebuild')",
    );
  },
};
