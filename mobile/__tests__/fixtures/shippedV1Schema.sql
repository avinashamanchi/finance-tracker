PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transactions (
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

CREATE INDEX IF NOT EXISTS transactions_occurred_on
  ON transactions(occurred_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS budgets (
  category_id TEXT PRIMARY KEY NOT NULL,
  limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
  updated_at TEXT NOT NULL
);

PRAGMA user_version = 1;
