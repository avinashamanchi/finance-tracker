import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const fixture = Object.freeze({
  algorithmVersion: 1,
  seed: 'finova-25k-v1',
  transactions: 100000,
  months: 120,
  budgets: 180,
  templates: 120,
  goals: 50,
});
const fixtureDigest = `sha256:${createHash('sha256').update(JSON.stringify(fixture)).digest('hex')}`;
const ledgerId = '90000000-0000-4000-8000-000000000001';

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)].toFixed(3));
}

function measure(work) {
  const started = performance.now();
  work();
  return performance.now() - started;
}

const directory = mkdtempSync(join(tmpdir(), 'finova-scale-profile-'));
const database = new DatabaseSync(join(directory, 'finova.sqlite'));
try {
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE transactions(
      id TEXT PRIMARY KEY NOT NULL, ledger_id TEXT NOT NULL,
      kind TEXT NOT NULL, amount_minor INTEGER NOT NULL, category_id TEXT NOT NULL,
      description TEXT NOT NULL, occurred_on TEXT NOT NULL, legacy_recurring INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX transactions_ledger_order
      ON transactions(ledger_id, occurred_on DESC, created_at DESC, id DESC);
    CREATE INDEX transactions_ledger_month_kind
      ON transactions(ledger_id, occurred_on, kind, category_id);
    CREATE VIRTUAL TABLE transaction_fts USING fts5(
      description, category_id, content='transactions', content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER transactions_fts_insert AFTER INSERT ON transactions BEGIN
      INSERT INTO transaction_fts(rowid, description, category_id)
        VALUES(new.rowid, new.description, new.category_id);
    END;
  `);
  const insertMs = measure(() => database.exec(`
    BEGIN IMMEDIATE;
    WITH RECURSIVE numbers(value) AS (
      VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < 100000
    )
    INSERT INTO transactions(
      id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
      legacy_recurring, created_at, updated_at
    )
    SELECT printf('10000000-0000-4000-8000-%012d', value), '${ledgerId}',
      CASE WHEN value % 5 = 0 THEN 'income' ELSE 'expense' END,
      (value % 500000) + 1,
      CASE WHEN value % 5 = 0 THEN 'salary' ELSE 'groceries' END,
      CASE WHEN value % 7 = 0 THEN 'Market purchase' ELSE 'Fixture entry' END,
      date('2026-08-15', printf('-%d months', (value - 1) % 120)), 0,
      date('2026-08-15', printf('-%d months', (value - 1) % 120)) || 'T12:00:00.000Z',
      date('2026-08-15', printf('-%d months', (value - 1) % 120)) || 'T12:00:00.000Z'
    FROM numbers;
    COMMIT;
  `));

  const firstPage = database.prepare(`
    SELECT id FROM transactions WHERE ledger_id = ?
    ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT 50
  `);
  const search = database.prepare(`
    SELECT transactions.id FROM transactions
    JOIN transaction_fts ON transaction_fts.rowid = transactions.rowid
    WHERE transactions.ledger_id = ? AND transaction_fts MATCH ?
    ORDER BY transactions.occurred_on DESC, transactions.created_at DESC,
      transactions.id DESC LIMIT 50
  `);
  const aggregate = database.prepare(`
    SELECT kind, COUNT(*) AS count, SUM(amount_minor) AS total
    FROM transactions WHERE ledger_id = ? AND occurred_on >= '2026-08-01'
      AND occurred_on < '2026-09-01' GROUP BY kind
  `);
  firstPage.all(ledgerId);
  search.all(ledgerId, 'market');
  aggregate.all(ledgerId);
  const timings = { firstPage: [], search: [], aggregate: [] };
  for (let iteration = 0; iteration < 10; iteration += 1) {
    timings.firstPage.push(measure(() => firstPage.all(ledgerId)));
    timings.search.push(measure(() => search.all(ledgerId, 'market')));
    timings.aggregate.push(measure(() => aggregate.all(ledgerId)));
  }
  const plan = (sql, ...params) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)
    .map((row) => String(row.detail));
  const evidence = {
    formatVersion: 1,
    scope: 'content-free Node SQLite regression evidence; not a physical-device pass',
    generatedAt: new Date().toISOString(),
    node: process.version,
    fixtureDigest,
    counts: fixture,
    setupMs: Number(insertMs.toFixed(3)),
    timingsMs: {
      firstPage: { p50: percentile(timings.firstPage, 0.5), p95: percentile(timings.firstPage, 0.95) },
      search: { p50: percentile(timings.search, 0.5), p95: percentile(timings.search, 0.95) },
      aggregate: { p50: percentile(timings.aggregate, 0.5), p95: percentile(timings.aggregate, 0.95) },
    },
    observedRssBytes: process.memoryUsage().rss,
    queryPlans: {
      firstPage: plan('SELECT id FROM transactions WHERE ledger_id = ? ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT 50', ledgerId),
      search: plan('SELECT transactions.id FROM transactions JOIN transaction_fts ON transaction_fts.rowid = transactions.rowid WHERE transactions.ledger_id = ? AND transaction_fts MATCH ? ORDER BY transactions.occurred_on DESC, transactions.created_at DESC, transactions.id DESC LIMIT 50', ledgerId, 'market'),
    },
    physicalDeviceGateSatisfied: false,
  };
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output || output.startsWith('-')) throw new Error('A profile output path is required.');
    writeFileSync(resolve(output), json, { encoding: 'utf8', mode: 0o600 });
  } else {
    process.stdout.write(json);
  }
} finally {
  database.close();
  rmSync(directory, { recursive: true, force: true });
}
