# Finova 25k MAU Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a paged, migration-safe, private local ledger with a stable one-time Finova Plus entitlement, encrypted portable data, recurring planning tools, and measurable large-ledger release gates.

**Architecture:** Expo screens consume bounded ledger/planning controllers backed by ordered SQLite migrations, keyset queries, FTS5, and SQL aggregates. RevenueCat handles only anonymous Apple purchase state, while finance content stays on device or in a user-directed authenticated backup; the unsafe web client is removed from every supported build and deploy path.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript 5.9, Expo Router 6, `expo-sqlite` 16, Node 22 `node:sqlite`, Jest 29, RevenueCat `react-native-purchases` 10.7, `@noble/ciphers`, `@noble/hashes`.

## Global Constraints

- Launch is iOS-first, local-first, and supports 25,000 MAU without a required account or Finova cloud API.
- Optional Apple-private iCloud sync is out of this launch wave; add no CloudKit container, entitlement, sync toggle, or sync claim.
- Finova Plus is Apple non-consumable `com.avinashamanchi.finova.plus.lifetime` mapped to RevenueCat entitlement `finova_plus`; it is never a subscription.
- Free keeps unlimited local transactions, current-month summaries, up to three active budget categories, version-1 import, encrypted backup, Delete All, and privacy-safe diagnostics.
- Plus unlocks unlimited active budgets, six-month insights, CSV export, monthly recurring templates/expected bills, budget rollover, and savings goals.
- StoreKit supplies every displayed price; no source file hard-codes a storefront price.
- Finance content never goes to RevenueCat; privacy copy must disclose anonymous app-user ID, product/purchase/entitlement data, and technical request metadata.
- Launch uses one immutable USD ledger because existing values are explicitly USD cents; stored money becomes safe-integer minor units with ledger currency code and minor-unit count.
- Transaction pages contain at most 50 rows; export/import pages contain at most 500 records; React transaction state contains at most 200 rows.
- Version-2 `.finova` files use scrypt with a 16-byte salt and 32-byte output, XChaCha20-Poly1305 authenticated 64 KiB frames, a 50 MiB encrypted-file limit, and passwords of 12-128 Unicode code points.
- Large-ledger fixtures contain 100,000 transactions across 120 months, 180 budget plans, 120 recurring templates, and 50 savings goals.
- Physical-device p95 gates are: current-schema open under 750 ms, frozen shipped-v1-to-v4 migration under 15 seconds, first page under 250 ms, FTS under 300 ms, monthly aggregate under 200 ms, no main-thread stall over 100 ms, and migration/encrypted-backup peak memory under 250 MiB.
- Do not overwrite or discard the uncommitted App Store/monetization work already in this worktree; reconcile it file by file.

---

### Task 1: Quarantine the unsafe legacy web client

**Files:**
- Create: `legacy-web/QUARANTINED.md`
- Create: `legacy-web/scripts/require-explicit-unsafe-opt-in.mjs`
- Move: `src/` to `legacy-web/src/`
- Move: `public/index.html` to `legacy-web/public/index.html`
- Move: `package.json` to `legacy-web/package.json`
- Move: `package-lock.json` to `legacy-web/package-lock.json`
- Modify: `legacy-web/package.json`
- Modify: `legacy-web/package-lock.json`
- Create: `mobile/__tests__/legacyWebQuarantine.test.ts`
- Modify: `.github/workflows/ios-ci.yml`
- Modify: `.github/workflows/release-readiness.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: current Create React App source and its plaintext `useAuth` browser-storage implementation.
- Produces: `node legacy-web/scripts/require-explicit-unsafe-opt-in.mjs`, which exits zero only when `FINOVA_ALLOW_UNSAFE_LEGACY_WEB=I_UNDERSTAND_PLAINTEXT_PASSWORD_STORAGE`; supported CI and release scripts have no dependency on `legacy-web`.

**Dirty-state and staging boundary:**
- Preserve the dirty root legal pages and all unrelated mobile/billing/App Store work; move only `public/index.html` from `public/`.
- Leave ignored root `build/` untouched; it is stale legacy output, not release evidence.
- Stage only the exact Task 1 paths below and verify the cached path inventory before committing; never broad-stage `public`, `mobile`, `.github/workflows`, or the repository.

- [ ] **Step 1: Write the failing quarantine test**

```ts
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

it('keeps the unsafe browser login outside supported build and deploy paths', () => {
  for (const unsupportedRootEntrypoint of ['src', 'public/index.html', 'package.json', 'package-lock.json']) {
    expect(fs.existsSync(path.join(root, unsupportedRootEntrypoint))).toBe(false);
  }
  const legacyPackage = JSON.parse(fs.readFileSync(path.join(root, 'legacy-web/package.json'), 'utf8'));
  const legacyLock = JSON.parse(fs.readFileSync(path.join(root, 'legacy-web/package-lock.json'), 'utf8'));
  expect(legacyPackage.scripts.deploy).toBeUndefined();
  expect(legacyPackage.scripts.predeploy).toBeUndefined();
  expect(legacyPackage.scripts.build).toBeUndefined();
  expect(legacyPackage.homepage).toBeUndefined();
  expect(legacyPackage.devDependencies?.['gh-pages']).toBeUndefined();
  expect(legacyLock.packages?.['node_modules/gh-pages']).toBeUndefined();
  expect(legacyPackage.scripts.prestart).toBeUndefined();
  expect(legacyPackage.scripts.start).toBe('node scripts/require-explicit-unsafe-opt-in.mjs && react-scripts start');
  expect(legacyPackage.scripts['build:unsupported-local-only']).toBe('node scripts/require-explicit-unsafe-opt-in.mjs && react-scripts build');
  for (const workflow of fs.readdirSync(path.join(root, '.github/workflows')).filter(name => /\.ya?ml$/i.test(name))) {
    const text = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    expect(text).not.toMatch(/legacy-web|react-scripts|gh-pages/);
  }
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/legacyWebQuarantine.test.ts`

Expected: FAIL because `src/hooks/useAuth.js` is still at the supported repository root and `legacy-web/package.json` does not exist.

- [ ] **Step 3: Move and lock the legacy client**

Use `git mv` for all six listed moves. Delete `deploy`, `predeploy`, and ordinary
`build`; remove `homepage` and `gh-pages` from both moved package files; then set
these scripts:

```json
{
  "scripts": {
    "start": "node scripts/require-explicit-unsafe-opt-in.mjs && react-scripts start",
    "build:unsupported-local-only": "node scripts/require-explicit-unsafe-opt-in.mjs && react-scripts build"
  }
}
```

Create the opt-in guard:

```js
const expected = 'I_UNDERSTAND_PLAINTEXT_PASSWORD_STORAGE';
if (process.env.FINOVA_ALLOW_UNSAFE_LEGACY_WEB !== expected) {
  process.stderr.write('Blocked: this unsupported legacy demo stores plaintext passwords in browser storage.\n');
  process.exit(1);
}
```

`QUARANTINED.md` and the root README must state that the demo is unsupported,
must never receive real credentials or finance data, has no deploy path, and is
not a migration source. They must also say this commit neither disables nor
updates the published Pages branch and does not clear browser `localStorage`.
Never migrate `finova_users` or `finova_session`. If historical finance data
matters, recovery is a separate user-directed workflow before authorized
shutdown. Before release, replace the Pages root with a safe static
landing/legal host or disable it and verify anonymously; do not perform or imply
that external action here, and do not publish only the legal pages onto the
unsafe existing branch. Keep `public/privacy.html`, `public/terms.html`, and
`public/support.html` at the repository root as static legal artifacts.

The README must point supported development/release instructions only to
`mobile/` and describe the exact opt-in as unsafe local archaeology. The guard
protects repository scripts, not arbitrary manual `react-scripts` execution.

- [ ] **Step 4: Add CI's supported-surface assertion and rerun**

Add the focused test to both workflows without replacing or narrowing their
existing full mobile test commands; do not add a legacy install/build step.
Exercise the guard with the variable explicitly unset, wrong values, and the
one exact allowed value.

Run under Node 22: `cd mobile && npx --yes node@22.22.0 "$(command -v npm)" test -- --runInBand __tests__/legacyWebQuarantine.test.ts && npx --yes node@22.22.0 "$(command -v npm)" run typecheck`, then run the guard once unset, once with a wrong value, and once with the exact allowed value. Only the exact value may exit zero.

Expected: PASS; TypeScript reports no errors.

- [ ] **Step 5: Commit the quarantine**

Stage only the literal moved/created/modified Task 1 paths (including both old
and new names, `README.md`, and only the two named workflow files), inspect
`git diff --cached --name-status`, and confirm every staged path is in the Task 1
allowlist before committing with subject
`chore: quarantine unsafe legacy web client`.

### Task 2: Replace schema bootstrap with real ordered migrations

**Files:**
- Delete: `mobile/src/data/schema.ts`
- Create: `mobile/src/data/migrations/types.ts`
- Create: `mobile/src/data/migrations/001_initial.ts`
- Create: `mobile/src/data/migrations/002_ledger_currency_fts.ts`
- Create: `mobile/src/data/migrations/003_recurring.ts`
- Create: `mobile/src/data/migrations/004_planning.ts`
- Create: `mobile/src/data/migrations/index.ts`
- Create: `mobile/src/data/migrations/runner.ts`
- Create: `mobile/src/data/configureConnection.ts`
- Create: `mobile/__tests__/sqliteMigrations.integration.test.ts`
- Create: `mobile/__tests__/migrationAdapterContract.test.ts`
- Create: `mobile/__tests__/fixtures/shippedV1Schema.sql`
- Create: `mobile/__tests__/support/nodeMigrationAdapter.ts`
- Modify: `mobile/src/data/financeRepository.ts`

**Interfaces:**
- Consumes: an Expo `SQLiteDatabase`-compatible connection and
  `MigrationContext { legacyLedgerId: string; currentMonth: string; nowIso: string }`.
- Produces: `LATEST_SCHEMA_VERSION = 4`, `MIGRATIONS: readonly Migration[]`, and `runMigrations(database: MigrationDatabase, context: MigrationContext): Promise<void>`.
- Produces `configureConnection()` that sets and verifies WAL,
  `foreign_keys = ON`, and a bounded busy timeout before any migration
  transaction. `legacyLedgerId` is an app-local random UUID, never derived from
  Apple, RevenueCat, device, or account identity; `currentMonth` is computed
  once from the device's local calendar as canonical `YYYY-MM`.

- [ ] **Step 1: Write real-SQLite red tests for every start state**

Create `mobile/__tests__/fixtures/shippedV1Schema.sql` as a frozen independent
copy of the schema shipped by the deleted `schema.ts`; never build legacy states
by running the new `MIGRATIONS` code under test. Test all of these fixtures:

- pristine v0;
- recoverable partial-v0 databases containing compatible subsets of the shipped
  v1 tables but `user_version = 0`;
- full shipped v1 with multiple transactions and timeless budgets;
- independently frozen populated v2, v3, and v4 databases;
- negative, newer-than-supported, and structurally incompatible/unknown v0.

Assert exact row/field/ID/timestamp/recurring/money/budget preservation, USD
ledger assignment, canonical current-month mapping, table/index/trigger counts,
`user_version`, `foreign_key_check`, and reopen behavior. Run initialization
twice with a different context and prove the persisted random ledger ID never
changes or duplicates. Unknown/incompatible v0 must fail closed with a bytewise
schema/data digest unchanged.

Create `mobile/__tests__/support/nodeMigrationAdapter.ts` and an adapter-contract
suite in this step. Both Node and Expo adapters expose bound `exec`, `run`,
`first`, `all`, and the same explicit write-lock/transaction semantics. Do not
claim `BEGIN IMMEDIATE` parity while Expo uses an ordinary deferred transaction.
Serialize initialization, acquire the agreed write lock, then read and validate
`user_version` inside it. A concurrent-initialize test must prove exactly one
immutable ledger is created and both callers observe schema v4.

- [ ] **Step 2: Run the integration test and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/sqliteMigrations.integration.test.ts`

Expected: FAIL because `mobile/src/data/migrations` and the Node adapter do not exist.

- [ ] **Step 3: Define the migration boundary and atomic runner**

```ts
export interface MigrationDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly (string | number | null)[]): Promise<void>;
  first<T>(sql: string, params?: readonly (string | number | null)[]): Promise<T | null>;
  all<T>(sql: string, params?: readonly (string | number | null)[]): Promise<readonly T[]>;
  exclusive<T>(work: (transaction: MigrationDatabase) => Promise<T>): Promise<T>;
}
export type MigrationContext = Readonly<{
  legacyLedgerId: string;
  currentMonth: string;
  nowIso: string;
}>;
export type Migration = Readonly<{
  version: number;
  name: string;
  up(database: MigrationDatabase, context: MigrationContext): Promise<void>;
}>;
```

Call `configureConnection()` before transactions; `foreign_keys = ON` inside a
transaction is ineffective. Verify WAL, foreign keys, and bounded busy timeout
on every connection. `runMigrations` must single-flight initialization, acquire
the same explicit write-lock semantics in Node and Expo, read/validate
`user_version` only after the lock, verify contiguous versions `1..4`, reject
negative/newer/unknown structural states, and apply each missing `up` plus
`PRAGMA user_version = N` inside the same rollback-safe transaction.

- [ ] **Step 4: Implement the four migrations with the shipped data contracts**

Migration 2 must rebuild version-1 rows into these core columns and create the named indexes/FTS triggers:

```sql
CREATE TABLE ledgers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
  currency_code TEXT NOT NULL CHECK(currency_code GLOB '[A-Z][A-Z][A-Z]'),
  currency_minor_unit INTEGER NOT NULL CHECK(currency_minor_unit BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE transactions_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  amount_minor INTEGER NOT NULL CHECK(
    typeof(amount_minor) = 'integer'
    AND amount_minor BETWEEN 1 AND 9007199254740991
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
CREATE INDEX transactions_ledger_order ON transactions_v2(ledger_id, occurred_on DESC, created_at DESC, id DESC);
CREATE INDEX transactions_ledger_month_kind ON transactions_v2(ledger_id, occurred_on, kind, category_id);
CREATE VIRTUAL TABLE transaction_fts USING fts5(description, category_id, content='transactions', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
```

Before destructive DDL, validate every legacy money value for SQLite integer
storage and JavaScript safe-integer range; one invalid row rolls back the entire
migration. Apply the same `typeof(...) = 'integer'` and range checks to every
monetary column in migrations 3/4: transaction/recurring amounts and positive
goal targets use `1..9007199254740991`; explicitly zero-capable budget and
contribution fields use `0..9007199254740991`. Test max-safe,
max-safe-plus-one, fractional, negative, zero, and rollback behavior.

Migration 3 creates `recurring_templates` and `expected_occurrences` with
`UNIQUE(template_id, due_on)`. Migration 4 creates `budget_plans` keyed by
`(ledger_id, category_id, month)`, `savings_goals`, and `goal_contributions`.
Rename `transactions_v2` to `transactions` first, create the external-content
FTS table and correct insert/update/delete triggers, then run
`INSERT INTO transaction_fts(transaction_fts) VALUES('rebuild')`. Use the FTS5
delete command correctly in update/delete triggers. Seed one `Personal` USD
ledger with minor unit 2 and migrate timeless budgets into the canonical local
`currentMonth` supplied by migration context. Use set-based `INSERT ... SELECT`
for row migration/backfill—never hydrate all legacy rows into JavaScript. Do not
infer templates from `legacy_recurring`.

- [ ] **Step 5: Prove trigger, rollback, reopen, and query-plan behavior**

Before any new write, assert a migrated legacy description is searchable through
FTS. Then insert/update/delete and prove old tokens disappear, new tokens appear,
deleted hits vanish, FTS/content row counts match, FTS `integrity-check` passes,
and results survive reopen. Inject failures after each destructive phase and
assert `user_version`, schema, ledger ID, and row digest remain unchanged. Run
initialization twice and concurrently; assert `EXPLAIN QUERY PLAN` mentions
`transactions_ledger_order` for the first-page query.

Run: `cd mobile && npm test -- --runInBand __tests__/sqliteMigrations.integration.test.ts`

Expected: PASS with no experimental-warning assertion dependency.

- [ ] **Step 6: Commit migrations**

Stage only the literal Task 2 file list above (including the deletion of
`schema.ts`), then require `git diff --cached --name-status` to equal that
allowlist and inspect the cached diff before committing with
`feat: add ordered SQLite migrations`. Do not stage the already-dirty mobile
package files or any directory wholesale.

### Task 3: Add ledger currency, keyset pagination, FTS, and SQL aggregates

**Files:**
- Modify: `mobile/src/domain/types.ts`
- Replace: `mobile/src/domain/money.ts`
- Create: `mobile/src/data/queryTypes.ts`
- Create: `mobile/src/data/transactionQueries.ts`
- Create: `mobile/src/data/aggregateQueries.ts`
- Modify: `mobile/src/data/financeRepository.ts`
- Modify: `mobile/src/data/inMemoryFinanceRepository.ts`
- Refactor: `mobile/src/data/FinanceProvider.tsx`
- Modify: `mobile/src/domain/summaries.ts`
- Create: `mobile/__tests__/transactionQueries.integration.test.ts`
- Modify: `mobile/__tests__/financeRepository.test.ts`
- Modify: `mobile/__tests__/financeProvider.test.tsx`
- Modify: `mobile/__tests__/money.test.ts`

**Interfaces:**
- Consumes: schema version 4 and `Ledger { id; name; currencyCode; currencyMinorUnit; createdAt; updatedAt }`.
- Produces: `listTransactionsPage(query: TransactionQuery): Promise<TransactionPage>`, `getMonthSummary(ledgerId: string, month: string): Promise<MonthSummary>`, `getSixMonthTrend(ledgerId: string, anchorMonth: string): Promise<readonly MonthlyPoint[]>`, and bounded `LedgerController` page state.

- [ ] **Step 1: Write failing pagination, search, aggregate, and controller tests**

```ts
const first = await repository.listTransactionsPage({ ledgerId, limit: 50, kinds: [], search: '' });
expect(first.items).toHaveLength(50);
expect(first.nextCursor).toEqual(expect.any(String));
const second = await repository.listTransactionsPage({ ledgerId, limit: 50, kinds: [], search: '', after: first.nextCursor });
expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(100);
expect(await repository.listTransactionsPage({ ledgerId, limit: 50, kinds: ['expense'], search: 'coffee shop' }))
  .toMatchObject({ items: [expect.objectContaining({ description: 'Coffee Shop' })] });
expect(await repository.getMonthSummary(ledgerId, '2026-08')).toMatchObject({ incomeMinor: 200000, expenseMinor: 7550, transactionCount: 3 });
```

Add a provider test that creates a transaction and expects `listTransactionsPage` plus affected aggregates to rerun while deprecated `listTransactions` and `snapshot` are not called.

- [ ] **Step 2: Run the focused suite and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/money.test.ts __tests__/transactionQueries.integration.test.ts __tests__/financeRepository.test.ts __tests__/financeProvider.test.tsx`

Expected: FAIL on missing ledger/minor-unit/page interfaces and current full reload behavior.

- [ ] **Step 3: Define exact page and money types**

```ts
export type TransactionCursor = string & { readonly __transactionCursor: unique symbol };
export type TransactionQuery = Readonly<{
  ledgerId: string;
  limit: 1 | 10 | 25 | 50;
  kinds: readonly TransactionKind[];
  search: string;
  after?: TransactionCursor;
}>;
export type TransactionPage = Readonly<{ items: readonly Transaction[]; nextCursor: TransactionCursor | null }>;
export type Ledger = Readonly<{ id: string; name: string; currencyCode: string; currencyMinorUnit: number; createdAt: string; updatedAt: string }>;
```

Rename domain fields `amountCents` to `amountMinor`, `limitCents` to `limitMinor`, and summary fields to `incomeMinor`, `expenseMinor`, and `balanceMinor`. Implement `parseMinorAmount(raw, minorUnit)` and `formatMinor(amountMinor, ledger, locale?)`; validate minor unit 0-3 and safe integers. Do not convert stored values.

- [ ] **Step 4: Implement escaped FTS and keyset SQL**

Normalize at most 80 Unicode code points into at most eight alphanumeric tokens; quote each token and append `*`. Bind the complete MATCH expression as a parameter. Encode/decode cursor JSON with Zod and base64url, containing only `occurredOn`, `createdAt`, and `id`.

```sql
WHERE t.ledger_id = ?
  AND (? = '' OR t.rowid IN (SELECT rowid FROM transaction_fts WHERE transaction_fts MATCH ?))
  AND (? IS NULL OR (t.occurred_on, t.created_at, t.id) < (?, ?, ?))
ORDER BY t.occurred_on DESC, t.created_at DESC, t.id DESC
LIMIT ?
```

Fetch `limit + 1`, return at most `limit`, and derive the next cursor from the last returned row only when an extra row exists.

- [ ] **Step 5: Move summaries into bounded SQL**

Use `SUM(CASE WHEN kind='income' THEN amount_minor ELSE 0 END)`, equivalent expense sum, `COUNT(*)`, and a grouped category query bounded by `occurred_on >= monthStart AND occurred_on < nextMonthStart`. Six-month insight is one grouped query over six bounded months followed by zero-filling missing months. Check every mapped total with `Number.isSafeInteger`.

- [ ] **Step 6: Refactor the controller away from full reloads**

```ts
export type LedgerController = Readonly<{
  ledger: Ledger | null;
  transactions: readonly Transaction[];
  nextCursor: TransactionCursor | null;
  summary: MonthSummary | null;
  loadingFirstPage: boolean;
  loadingMore: boolean;
  loadFirst(query?: Pick<TransactionQuery, 'kinds' | 'search'>): Promise<void>;
  loadMore(): Promise<void>;
  createTransaction(draft: TransactionDraft): Promise<Transaction>;
  updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
}>;
```

Use a monotonically increasing request generation to discard stale search/page responses. Append/dedupe pages and retain only the newest 200 rows. A mutation re-fetches the first page and current summary/budget usage; it never invokes all-row `snapshot()`.

- [ ] **Step 7: Run focused and complete tests**

Run: `cd mobile && npm test -- --runInBand __tests__/money.test.ts __tests__/transactionQueries.integration.test.ts __tests__/financeRepository.test.ts __tests__/financeProvider.test.tsx && npm test -- --runInBand && npm run typecheck`

Expected: all tests PASS; TypeScript reports no errors.

- [ ] **Step 8: Commit bounded ledger queries**

Stage only the literal Task 3 file list, require the cached name-status list to
equal that allowlist, inspect the cached diff, and commit with
`feat: page and aggregate the local ledger`. Never stage a directory wholesale.

### Task 4: Implement recurring bills, month budgets, rollover, and savings goals

**Files:**
- Create: `mobile/src/domain/recurrence.ts`
- Create: `mobile/src/data/recurringRepository.ts`
- Create: `mobile/src/data/recurringController.ts`
- Create: `mobile/src/domain/planning.ts`
- Create: `mobile/src/data/planningRepository.ts`
- Create: `mobile/src/data/PlanningProvider.tsx`
- Create: `mobile/src/access/entitlements.ts`
- Create: `mobile/__tests__/recurrence.test.ts`
- Create: `mobile/__tests__/recurringRepository.integration.test.ts`
- Create: `mobile/__tests__/recurringController.test.ts`
- Create: `mobile/__tests__/planningRepository.integration.test.ts`
- Create: `mobile/__tests__/planningProvider.test.tsx`
- Modify: `mobile/src/data/financeRepository.ts`
- Modify: `mobile/src/data/validation.ts`
- Modify: `mobile/src/data/inMemoryFinanceRepository.ts`

**Interfaces:**
- Consumes: active ledger/category identity, SQL monthly expenses, entitlement status, and exclusive transaction support.
- Produces: `upsertTemplate`, `materializeExpectedOccurrences`, `listExpectedBills`, `recordExpectedBill`, `setBudgetPlan`, `listBudgetUsage`, `createGoal`, `addGoalContribution`, and `archiveGoal` without auto-posting transactions or deleting locked data.

- [ ] **Step 1: Write failing calendar and idempotency tests**

```ts
expect(resolveMonthlyDueDate('2027-02', 31)).toBe('2027-02-28');
expect(resolveMonthlyDueDate('2028-02', 31)).toBe('2028-02-29');
await repository.materializeExpectedOccurrences(ledgerId, '2026-08-07');
await repository.materializeExpectedOccurrences(ledgerId, '2026-08-07');
expect(await repository.listExpectedBills(ledgerId, '2026-08-01', '2026-10-31')).toHaveLength(3);
await repository.recordExpectedBill(occurrenceId, { occurredOn: '2026-08-10' });
await expect(repository.recordExpectedBill(occurrenceId, { occurredOn: '2026-08-10' })).rejects.toThrow('already recorded');
```

- [ ] **Step 2: Run the recurrence suite and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/recurrence.test.ts __tests__/recurringRepository.integration.test.ts __tests__/recurringController.test.ts`

Expected: FAIL because recurrence modules do not exist.

- [ ] **Step 3: Implement the domain types and due-date rule**

```ts
export type RecurringTemplate = Readonly<{
  id: string; ledgerId: string; description: string; categoryId: ExpenseCategoryId;
  amountMinor: number; dueDay: number; startMonth: string; endMonth: string | null;
  enabled: boolean; createdAt: string; updatedAt: string;
}>;
export type ExpectedBillStatus = 'upcoming' | 'due' | 'overdue' | 'recorded';
export type ExpectedBill = Readonly<{
  id: string; templateId: string; dueOn: string; transactionId: string | null;
  status: ExpectedBillStatus; template: RecurringTemplate;
}>;
```

Reject due days outside 1-31, end month before start month, non-expense categories, non-positive amounts, and descriptions outside 1-120 code points.

- [ ] **Step 4: Implement idempotent materialization and atomic recording**

Materialize previous/current/next two months with `INSERT ... ON CONFLICT(template_id, due_on) DO NOTHING`. Derive status using the caller-supplied local date. `recordExpectedBill` must run transaction insert and occurrence link update in one exclusive transaction, guarded by `transaction_id IS NULL`; it copies template fields and sets `source_template_id/source_due_on`.

- [ ] **Step 5: Verify no automatic spending and safe template deletion**

Add tests showing materialization changes no monthly totals, disabling a template creates no future occurrences, deleting an unrecorded occurrence leaves transactions unchanged, and deleting a template never deletes a linked recorded transaction.

Run: `cd mobile && npm test -- --runInBand __tests__/recurrence.test.ts __tests__/recurringRepository.integration.test.ts __tests__/recurringController.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Write failing rollover and goal tests**

```ts
await repository.setBudgetPlan({ ledgerId, categoryId: 'groceries', month: '2026-07', limitMinor: 50000, rolloverPolicy: 'carry_unused' });
await repository.insertExpense({ ledgerId, categoryId: 'groceries', occurredOn: '2026-07-10', amountMinor: 42000 });
await repository.setBudgetPlan({ ledgerId, categoryId: 'groceries', month: '2026-08', limitMinor: 50000, rolloverPolicy: 'carry_unused' });
expect(await repository.getBudgetUsage(ledgerId, 'groceries', '2026-08')).toMatchObject({ baseMinor: 50000, carryMinor: 8000, availableMinor: 58000 });
const goal = await repository.createGoal({ ledgerId, name: 'Emergency fund', targetMinor: 300000, targetOn: null });
await repository.addGoalContribution({ goalId: goal.id, amountMinor: 25000, occurredOn: '2026-08-07', note: 'Recorded transfer' });
expect(await repository.getGoalProgress(goal.id)).toMatchObject({ recordedMinor: 25000, remainingMinor: 275000 });
```

- [ ] **Step 7: Run planning tests and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/planningRepository.integration.test.ts __tests__/planningProvider.test.tsx`

Expected: FAIL because planning repository/provider do not exist.

- [ ] **Step 8: Define deterministic budget and goal contracts**

```ts
export type RolloverPolicy = 'none' | 'carry_unused';
export type BudgetPlanDraft = Readonly<{ ledgerId: string; categoryId: ExpenseCategoryId; month: string; limitMinor: number; rolloverPolicy: RolloverPolicy }>;
export type BudgetUsage = Readonly<{ baseMinor: number; carryMinor: number; spentMinor: number; availableMinor: number; remainingMinor: number }>;
export type SavingsGoalDraft = Readonly<{ ledgerId: string; name: string; targetMinor: number; targetOn: string | null }>;
export type GoalProgress = Readonly<{ recordedMinor: number; remainingMinor: number; percent: number }>;
export type EntitlementStatus = 'active' | 'inactive' | 'unknown';
```

Carry is `max(0, previous base limit - previous spent)` only when both adjacent plans use `carry_unused`; carried funds do not compound, and a missing previous plan or overspending produces zero carry. Contributions may not be negative or zero. Percent is capped at 100 for display while recorded amount remains exact.

- [ ] **Step 9: Implement SQL-derived usage and transactional goal writes**

Use bounded previous/current month aggregate queries, never stored carry totals. Backdated transaction edits must immediately change the result. Enforce unique active goal names per ledger case-insensitively. Archiving hides a goal from active lists but retains its contribution history.

- [ ] **Step 10: Enforce the free three-budget policy without deleting data**

The provider accepts `EntitlementStatus` and rejects creation of a fourth active current-month category only when status is `inactive`. Status `unknown` cannot create a fourth category but must continue showing every existing plan. Plus-to-free transitions never delete or zero plans.

Run: `cd mobile && npm test -- --runInBand __tests__/planningRepository.integration.test.ts __tests__/planningProvider.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 11: Run the combined planning suite and commit**

Run: `cd mobile && npm test -- --runInBand __tests__/recurrence.test.ts __tests__/recurringRepository.integration.test.ts __tests__/recurringController.test.ts __tests__/planningRepository.integration.test.ts __tests__/planningProvider.test.tsx && npm run typecheck`

Expected: PASS.

Stage only the literal Task 4 file list, require the cached name-status list to
equal that allowlist, inspect the cached diff, and commit with
`feat: add local recurring and planning tools`. Never stage a directory
wholesale.

### Task 5: Add encrypted streaming backup, safe diagnostics, and complete deletion

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Replace: `mobile/src/services/backup.ts`
- Replace: `mobile/src/services/importBackup.ts`
- Create: `mobile/src/services/backupFormat.ts`
- Create: `mobile/src/services/backupCrypto.ts`
- Create: `mobile/src/services/backupRecords.ts`
- Create: `mobile/src/services/backupExporter.ts`
- Create: `mobile/src/services/backupImporter.ts`
- Create: `mobile/src/data/importStagingRepository.ts`
- Modify: `mobile/src/services/artifacts.ts`
- Create: `mobile/src/services/diagnostics.ts`
- Create: `mobile/src/services/preferences.ts`
- Modify: `mobile/src/services/deleteAllData.ts`
- Modify: `mobile/src/data/financeRepository.ts`
- Modify: `mobile/app/_layout.tsx`
- Create: `mobile/__tests__/backupCrypto.test.ts`
- Create: `mobile/__tests__/backupStreaming.integration.test.ts`
- Modify: `mobile/__tests__/backup.test.ts`
- Create: `mobile/__tests__/diagnostics.test.ts`
- Modify: `mobile/__tests__/deleteAllData.test.ts`
- Modify: `mobile/__tests__/artifacts.test.ts`

**Interfaces:**
- Consumes: repository iterators of at most 500 records, an app-owned binary file handle, content-free database statistics, and bounded performance timings.
- Produces: `exportEncryptedBackup(options): Promise<ArtifactReceipt>`, `inspectEncryptedBackup(file, password): Promise<BackupManifest>`, `importEncryptedBackup(options): Promise<ImportReceipt>`, `buildDiagnostics(input): DiagnosticsReport`, and retryable `deleteAllAppData(): Promise<DeleteAllResult>`.

- [ ] **Step 1: Install exact locked crypto implementations**

Run: `cd mobile && npm install --save-exact @noble/ciphers @noble/hashes`

Expected: package and lockfile contain exact resolved versions; `npm audit --audit-level=high` exits zero before continuing.

- [ ] **Step 2: Write red tests for authentication, bounds, and atomicity**

```ts
const file = await exportEncryptedBackup({ repository, artifacts, password: 'correct horse battery staple' });
const manifest = await inspectEncryptedBackup(file.uri, 'correct horse battery staple');
const expectedCount = Object.values(manifest.counts).reduce((sum, count) => sum + count, 0);
expect(await importEncryptedBackup({ repository: target, fileUri: file.uri, password: 'correct horse battery staple' })).toMatchObject({ replaced: true, recordCount: expectedCount });
await expect(importEncryptedBackup({ repository: target, fileUri: file.uri, password: 'wrong password value' })).rejects.toThrow('password or file');
await tamperWithByte(file.uri, 70000);
await expect(importEncryptedBackup({ repository: target, fileUri: file.uri, password: 'correct horse battery staple' })).rejects.toThrow('password or file');
expect(await target.getSentinelTransaction()).toEqual(sentinel);
```

Also test a truncated final frame, 50 MiB + 1 byte rejection before file open, a 64 KiB + 1 plaintext record rejection, duplicate ID, unknown record kind, declared-count mismatch, and cleanup on cancellation/failure.

- [ ] **Step 3: Run backup tests and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/backupCrypto.test.ts __tests__/backupStreaming.integration.test.ts __tests__/backup.test.ts`

Expected: FAIL because the streaming format and binary artifact interfaces do not exist.

- [ ] **Step 4: Implement the authenticated frame format**

```ts
export const BACKUP_MAGIC = new Uint8Array([0x46, 0x49, 0x4e, 0x4f, 0x56, 0x41, 0x32, 0x00]);
export const BACKUP_FORMAT_VERSION = 2;
export const FRAME_PLAINTEXT_BYTES = 65_536;
export const MAX_ENCRYPTED_BACKUP_BYTES = 52_428_800;
export const KDF_PARAMS = Object.freeze({ N: 32_768, r: 8, p: 1, dkLen: 32 });
export type BackupHeader = Readonly<{
  version: 2; kdf: 'scrypt'; cipher: 'xchacha20-poly1305'; saltBase64: string;
  noncePrefixBase64: string; frameBytes: 65536; counts: Readonly<Record<BackupRecordKind, number>>;
}>;
```

Use `scryptAsync` and `xchacha20poly1305` from the locked Noble packages. Header bytes plus an unsigned 64-bit frame counter are AAD. Derive each 24-byte nonce from a random 16-byte prefix and big-endian counter. Refuse counter reuse/overflow. Zero derived-key and plaintext chunk buffers in `finally`.

- [ ] **Step 5: Implement paged NDJSON export and staged import**

Add `ArtifactStore.createBinary(base: string, extension: 'finova'): Promise<OwnedBinaryArtifact>` with an `expo-file-system` `FileHandle`. Record kinds are exactly `manifest`, `ledger`, `transaction`, `budget_plan`, `recurring_template`, `expected_occurrence`, `savings_goal`, and `goal_contribution`. Each strict Zod record is at most 64 KiB UTF-8 plus newline.

Import authenticated frames incrementally into staging tables. After EOF, run declared-count, duplicate, category, date, safe-integer, and `PRAGMA foreign_key_check` validations. Call `replaceFromStaging()` once in an exclusive transaction; any earlier failure calls `dropStaging()` and leaves active rows untouched. Keep the existing version-1 JSON parser only for import compatibility.

- [ ] **Step 6: Prove bounded reads and cleanup**

Inject spies and assert no repository read asks for more than 500 records, no artifact survives share close/import failure, wrong-password errors do not distinguish header/ciphertext details, and password/key values never appear in thrown messages or diagnostic objects.

Run: `cd mobile && npm test -- --runInBand __tests__/backupCrypto.test.ts __tests__/backupStreaming.integration.test.ts __tests__/backup.test.ts __tests__/artifacts.test.ts && npm run typecheck && npm audit --audit-level=high`

Expected: PASS and audit exits zero.

- [ ] **Step 7: Write failing redaction and partial-failure tests**

```ts
const report = buildDiagnostics({
  appVersion: '1.2.0', buildNumber: '42', osVersion: 'iOS 26.0', schemaVersion: 4,
  counts: { transactions: 100000, budgets: 180, templates: 120, goals: 50 },
  databaseBytes: 9437184, timingsMs: { firstPage: 84, aggregate: 31 }, errorCodes: ['DB_OPEN_FAILED'],
});
expect(JSON.stringify(report)).not.toMatch(/description|amount|occurred|category|uuid|revenuecat|file:\/\//i);
expect(report.databaseSizeBucket).toBe('8-16 MiB');
expect(await deleteAllAppData(failingDependencies)).toEqual({ ok: false, failed: ['artifacts'], retryable: true });
```

- [ ] **Step 8: Run diagnostics/deletion tests and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/diagnostics.test.ts __tests__/deleteAllData.test.ts __tests__/artifacts.test.ts`

Expected: FAIL on missing report fields and incomplete cleanup coordination.

- [ ] **Step 9: Implement a strict diagnostic allowlist**

```ts
export type DiagnosticsReport = Readonly<{
  formatVersion: 1; appVersion: string; buildNumber: string; osVersion: string;
  schemaVersion: number; rowCounts: Readonly<Record<'transactions' | 'budgets' | 'templates' | 'goals', number>>;
  databaseSizeBucket: '<1 MiB' | '1-4 MiB' | '4-8 MiB' | '8-16 MiB' | '16-32 MiB' | '32-64 MiB' | '64+ MiB';
  timingsMs: Readonly<{ firstPage: number; aggregate: number }>;
  errorCodes: readonly string[];
}>;
```

Construct a new object from allowlisted fields only; never spread inputs. Generate/share only after the user previews the report. Do not persist it after the share sheet closes.

- [ ] **Step 10: Coordinate deletion and startup cleanup**

Increment repository/controller generations first, close backup/import file handles, delete all active and staging finance tables in one exclusive transaction, run `PRAGMA wal_checkpoint(TRUNCATE)`, clear app-owned preferences, and delete the complete `finova-artifacts` namespace. Attempt each subsystem even if an earlier subsystem fails; return exact failed subsystem names and `retryable: true`.

On root layout startup, call artifact cleanup before exposing export/import actions. Treat a missing namespace as success and an outside-namespace URI as a hard error.

- [ ] **Step 11: Run the combined backup/privacy checks**

Run: `cd mobile && npm test -- --runInBand __tests__/backupCrypto.test.ts __tests__/backupStreaming.integration.test.ts __tests__/backup.test.ts __tests__/diagnostics.test.ts __tests__/deleteAllData.test.ts __tests__/artifacts.test.ts && npm run typecheck && npm audit --audit-level=high`

Expected: PASS.

- [ ] **Step 12: Commit private data portability and cleanup**

Stage only the literal Task 5 file list, require the cached name-status list to
equal that allowlist, inspect the cached diff, and commit with
`feat: add private backup and cleanup foundation`. Reconcile already-dirty files
line by line and never stage a directory wholesale.

### Task 6: Stabilize anonymous RevenueCat entitlement refresh and privacy truth

**Files:**
- Modify: `mobile/src/billing/revenueCatService.ts`
- Modify: `mobile/src/billing/BillingProvider.tsx`
- Create: `mobile/src/billing/entitlementPolicy.ts`
- Modify: `mobile/src/access/entitlements.ts`
- Modify: `mobile/__tests__/billingService.test.ts`
- Create: `mobile/__tests__/billingProvider.test.tsx`
- Modify: `mobile/__tests__/upgradeFlow.test.tsx`
- Modify: `mobile/src/screens/PrivacyScreen.tsx`
- Modify: `public/privacy.html`
- Modify: `public/terms.html`
- Modify: `docs/app-store/privacy-draft.md`
- Modify: `docs/app-store/monetization-setup.md`
- Modify: `docs/app-store/review-notes-draft.md`

**Interfaces:**
- Consumes: RevenueCat customer info, StoreKit localized product, app lifecycle, and existing constants.
- Produces: `EntitlementSnapshot { status; availability; products; refreshedAt; source }`, listener subscription cleanup, single-flight refresh/purchase/restore, and accurate purchase privacy copy.

- [ ] **Step 1: Write failing lifecycle and stale-state tests**

```ts
expect(rendered.current.status).toBe('inactive');
act(() => fakeRevenueCat.emitCustomerInfo(customerInfo(true)));
expect(rendered.current.status).toBe('active');
fakeAppState.emit('active');
await waitFor(() => expect(fakeRevenueCat.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1));
fakeRevenueCat.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
await act(() => rendered.current.refresh());
expect(rendered.current.status).toBe('active');
expect(rendered.current.availability).toBe('error');
expect(fakeRevenueCat.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
expect(fakeRevenueCat.removeCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
```

Add tests that simultaneous refreshes make one SDK request, cancellation does not say a charge completed, restore can activate after reinstall, missing product never renders a hard-coded price, and no custom RevenueCat attributes or ledger values are sent.

- [ ] **Step 2: Run billing tests and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/billingService.test.ts __tests__/billingProvider.test.tsx __tests__/upgradeFlow.test.tsx`

Expected: FAIL because the current module boundary has no listener, app-foreground invalidation, tri-state status, or refresh provenance.

- [ ] **Step 3: Define the entitlement state machine**

```ts
import type { EntitlementStatus } from '../access/entitlements';
export type EntitlementSource = 'launch' | 'foreground' | 'listener' | 'purchase' | 'restore';
export type EntitlementSnapshot = Readonly<{
  status: EntitlementStatus;
  availability: BillingAvailability;
  products: readonly BillingProduct[];
  refreshedAt: string | null;
  source: EntitlementSource;
}>;
```

An authoritative active customer-info response sets `active`; an authoritative response without `finova_plus` sets `inactive`. A failed first refresh is `unknown`. A failed later refresh keeps the last authoritative status in memory while setting availability `error`. Never persist a hand-written entitlement boolean.

- [ ] **Step 4: Add RevenueCat listener and foreground refresh**

Extend `RevenueCatModule` with `addCustomerInfoUpdateListener`, `removeCustomerInfoUpdateListener`, and `invalidateCustomerInfoCache`. Configure anonymously with only the public Apple SDK key. Subscribe after configure, unsubscribe on provider unmount, invalidate/fetch on transition to active, and serialize refresh/purchase/restore through one in-flight promise.

Keep Expo Go in explicit preview without loading native billing. Keep Restore visible; when unavailable, explain why and offer retry rather than silently disabling it.

- [ ] **Step 5: Correct privacy, terms, and reviewer copy**

Use this disclosure consistently:

> Finova does not send your ledger, amounts, descriptions, categories, backups, or support report to RevenueCat. Apple and RevenueCat process an anonymous app-user identifier, product and purchase/entitlement information, and technical request metadata to offer and restore the one-time Finova Plus purchase.

State that Delete All does not cancel/refund the non-consumable or erase Apple's purchase record, and that Restore Purchases rechecks the Apple account. Remove unqualified claims of “no third party.”

- [ ] **Step 6: Run billing, policy, and static checks**

Run: `cd mobile && npm test -- --runInBand __tests__/billingService.test.ts __tests__/billingProvider.test.tsx __tests__/upgradeFlow.test.tsx __tests__/policyContent.test.tsx __tests__/publication.test.ts && npm run typecheck`

Expected: PASS; privacy text tests find the RevenueCat disclosure and no subscription language.

- [ ] **Step 7: Commit stable purchase state**

Stage only the literal Task 6 file list, require the cached name-status list to
equal that allowlist, inspect the cached diff, and commit with
`feat: stabilize Finova Plus entitlement state`. Reconcile already-dirty files
line by line and never stage a directory wholesale.

### Task 7: Wire bounded transactions, expected bills, rollover, goals, backup, and diagnostics into the phone UI

**Files:**
- Modify: `mobile/src/screens/TransactionsScreen.tsx`
- Modify: `mobile/src/screens/HomeScreen.tsx`
- Modify: `mobile/src/screens/BudgetsScreen.tsx`
- Modify: `mobile/src/screens/SettingsScreen.tsx`
- Modify: `mobile/src/screens/InsightsScreen.tsx`
- Modify: `mobile/src/screens/TransactionEditor.tsx`
- Create: `mobile/src/screens/ExpectedBillsScreen.tsx`
- Create: `mobile/src/screens/RecurringTemplateEditor.tsx`
- Create: `mobile/src/screens/SavingsGoalsScreen.tsx`
- Create: `mobile/src/screens/SavingsGoalEditor.tsx`
- Create: `mobile/app/expected-bills.tsx`
- Create: `mobile/app/recurring-template/[id].tsx`
- Create: `mobile/app/recurring-template/new.tsx`
- Create: `mobile/app/savings-goals.tsx`
- Create: `mobile/app/savings-goal/[id].tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/__tests__/transactionsFlow.test.tsx`
- Create: `mobile/__tests__/expectedBillsFlow.test.tsx`
- Modify: `mobile/__tests__/budgetsFlow.test.tsx`
- Create: `mobile/__tests__/savingsGoalsFlow.test.tsx`
- Modify: `mobile/__tests__/settingsFlow.test.tsx`
- Modify: `mobile/__tests__/accessibility.test.tsx`

**Interfaces:**
- Consumes: bounded ledger/planning/billing controllers and streaming service operations from Tasks 3-8.
- Produces: accessible phone flows that expose every chosen feature without hydrating the complete ledger.

- [ ] **Step 1: Write failing user-flow tests**

```ts
fireEvent.changeText(view.getByLabelText('Search transactions'), 'coffee');
await waitFor(() => expect(repository.listTransactionsPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'coffee', limit: 50 })));
fireEvent(view.getByTestId('transaction-list'), 'endReached');
await waitFor(() => expect(repository.listTransactionsPage).toHaveBeenCalledTimes(2));
fireEvent.press(view.getByRole('button', { name: 'Record expected rent bill' }));
expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/transaction/new' }));
fireEvent.press(view.getByRole('button', { name: 'Export encrypted Finova backup' }));
expect(view.getByText(/cannot recover this password/i)).toBeTruthy();
```

Add free/Plus tests for fourth-budget blocking, rollover choice, expected-bill and goal gates, unknown entitlement preserving visible data, password confirmation mismatch, diagnostic preview, and Delete All's Apple-purchase boundary.

- [ ] **Step 2: Run the screen suite and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/transactionsFlow.test.tsx __tests__/expectedBillsFlow.test.tsx __tests__/budgetsFlow.test.tsx __tests__/savingsGoalsFlow.test.tsx __tests__/settingsFlow.test.tsx __tests__/accessibility.test.tsx`

Expected: FAIL on missing routes/screens and current in-memory filtering/full-snapshot export.

- [ ] **Step 3: Convert transactions and dashboards to bounded repository state**

Use `FlatList` with stable `keyExtractor`, `onEndReached`, loading footer, retry state, and distinct empty versus filtered-empty copy. Debounce search by 250 ms and pass it to `loadFirst`; never filter the controller array as a substitute for FTS. Home and Insights render SQL summary results. Mutation success retains focus and announces the changed row without reloading all pages.

- [ ] **Step 4: Add expected-bill and planning flows**

Expected Bills shows overdue, due, upcoming, and recorded text labels, never color alone. Template editor supports monthly amount/category/day/start/end and explicit enabled state. Recording pre-fills but does not save until user confirms the transaction editor. Budgets choose month and rollover policy; Goals shows recorded contribution progress and says no money is moved.

Gate Plus creation/actions through `status === 'active'`; unknown/inactive state keeps existing records readable. Every locked surface links to the transparent one-time Plus screen and states which free functions remain available.

- [ ] **Step 5: Replace Settings' snapshot operations**

Prompt twice for a 12-128-code-point backup password, show that it cannot be recovered, and call the streaming exporter without `finance.snapshot()`. Import previews manifest counts and ledger currency before a destructive confirmation. Add a diagnostics preview screen/alert before share. Delete copy must name transactions, plans, templates, expected bills, goals, contributions, preferences, and temporary artifacts, and state that Apple purchase history remains.

- [ ] **Step 6: Run interaction, accessibility, and navigation checks**

Run: `cd mobile && npm test -- --runInBand __tests__/transactionsFlow.test.tsx __tests__/expectedBillsFlow.test.tsx __tests__/budgetsFlow.test.tsx __tests__/savingsGoalsFlow.test.tsx __tests__/settingsFlow.test.tsx __tests__/accessibility.test.tsx __tests__/navigation.test.tsx && npm run typecheck && npm run lint`

Expected: PASS; every target is at least 44 points, has a role/label/state, supports keyboard-safe scrolling, and has no color-only status.

- [ ] **Step 7: Commit complete phone flows**

Stage only the literal Task 7 file list, require the cached name-status list to
equal that allowlist, inspect the cached diff, and commit with
`feat: expose scalable Plus planning flows`. Reconcile already-dirty files line
by line and never stage a directory wholesale.

### Task 8: Enforce large-ledger, release, and external Apple/RevenueCat gates

**Files:**
- Create: `mobile/src/testing/largeLedgerFixture.ts`
- Create: `mobile/__tests__/largeLedgerQueries.integration.test.ts`
- Create: `mobile/__tests__/largeLedgerMigration.integration.test.ts`
- Create: `mobile/__tests__/noFullReload.test.ts`
- Create: `mobile/scripts/profile-large-ledger.mjs`
- Modify: `mobile/package.json`
- Modify: `.github/workflows/ios-ci.yml`
- Modify: `.github/workflows/release-readiness.yml`
- Create: `docs/app-store/finova-25k-device-evidence.md`
- Modify: `docs/app-store/finova-ios-release-checklist.md`
- Modify: `docs/app-store/monetization-setup.md`
- Modify: `docs/app-store/review-notes-draft.md`
- Modify: `docs/app-store/screenshot-matrix.md`

**Interfaces:**
- Consumes: schema/query/backup/UI release candidate and external Apple/RevenueCat configuration.
- Produces: deterministic 100k-row evidence, static no-full-reload enforcement, physical-device evidence template with exact numeric gates, and an honest unchecked external release matrix.

- [ ] **Step 1: Write failing large-ledger and forbidden-call tests**

```ts
const fixture = buildLargeLedgerFixture({ seed: 'finova-25k-v1', transactions: 100000, months: 120, budgets: 180, templates: 120, goals: 50 });
const repeat = buildLargeLedgerFixture({ seed: 'finova-25k-v1', transactions: 100000, months: 120, budgets: 180, templates: 120, goals: 50 });
expect(fixture.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
expect(repeat.digest).toBe(fixture.digest);
expect((await repository.listTransactionsPage({ ledgerId, limit: 50, kinds: [], search: '' })).items).toHaveLength(50);
expect(await explainFirstPage(repository)).toContain('transactions_ledger_order');
expect(await explainSearch(repository, 'market')).toContain('transaction_fts');
```

Build the same deterministic data twice: once directly at current schema and
once by loading the independent frozen shipped-v1 schema and then running the
real v1-to-v4 migration. The migration test asserts counts, a content digest,
the immutable ledger ID, current-month budgets, FTS searchability/integrity,
`foreign_key_check`, reopen, and a second no-op migration. Inject a failure late
in the 100k-row migration and prove rollback leaves the frozen source digest and
`user_version` unchanged.

`noFullReload.test.ts` reads supported screen/provider source and fails on `.snapshot()` in UI code, `listTransactions()` in production code, `SELECT * FROM transactions` without `LIMIT`, or `OFFSET` in transaction pagination.

- [ ] **Step 2: Run scale tests and verify red**

Run: `cd mobile && npm test -- --runInBand __tests__/largeLedgerQueries.integration.test.ts __tests__/largeLedgerMigration.integration.test.ts __tests__/noFullReload.test.ts`

Expected: FAIL until the deterministic fixture, digest, query-plan helpers, and static rules exist. Record the generator's observed stable SHA-256 in the device-evidence file produced by the profiling step.

- [ ] **Step 3: Build the deterministic fixture and bounded Node profiler**

The fixture uses a seeded PRNG and bulk inserts inside one transaction. The
profiler separately measures current-schema open and the complete frozen
shipped-v1-to-v4 migration, then runs one warm-up plus ten measured iterations
for first page, FTS, aggregate, and encrypted export/import. It verifies the
post-migration digest/counts/FTS/foreign keys/reopen result before recording any
timing. It writes content-free JSON containing Node version, schema versions,
fixture digest, counts, p50/p95 timings, peak RSS, and query plans. Node timing
is regression evidence only and cannot mark the physical-device rows passed.

Add scripts:

```json
{
  "test:scale": "jest --runInBand __tests__/largeLedgerQueries.integration.test.ts __tests__/largeLedgerMigration.integration.test.ts __tests__/noFullReload.test.ts",
  "profile:scale": "node scripts/profile-large-ledger.mjs"
}
```

- [ ] **Step 4: Add CI scale and dependency gates**

Run `npm run test:scale` in `ios-ci.yml`. Run `npm run profile:scale` in the manually dispatched readiness workflow and upload only its content-free JSON for 14 days. Keep `npm audit --audit-level=high`, TypeScript, lint, Expo Doctor, iOS export, secret scan, and clean native prebuild gates.

- [ ] **Step 5: Create the exact physical-device evidence matrix**

`finova-25k-device-evidence.md` has unchecked rows for device model, iOS version,
signed build ID, fixture digest, ten raw current-schema-open samples, ten raw
frozen-v1-to-v4 migration samples, calculated p95 values, migration and backup
peak memory, maximum main-thread stall during migration, migrated digest/counts,
FTS/integrity/rollback/reopen checks, VoiceOver, Dynamic Type 200%, Reduced
Motion, smallest screen, keyboard, purchase/restore, encrypted export/import,
and Delete All. Thresholds are the exact Global Constraints values. A person
records observed values from a signed build; prose such as “fast,” simulator
output, or the Node profiler cannot pass a row.

- [ ] **Step 6: Preserve external Apple and RevenueCat blockers**

Keep each item unchecked until observed in its authoritative system: Paid Apps Agreement/banking/tax; App Store Connect non-consumable/localization/price/review asset; RevenueCat Apple connection/product/current lifetime offering/`finova_plus`; public Apple SDK key in credentialed EAS environments; sandbox purchase/cancel/interruption/already-owned/listener/reinstall/restore; exact TestFlight candidate repeat; accurate App Privacy answers and live legal URLs; App Review submission/approval/public listing. Do not mutate those systems as part of this code plan.

- [ ] **Step 7: Run the complete repository-controlled release suite**

Run: `cd mobile && npm test -- --runInBand && npm run test:scale && npm run typecheck && npm run lint && npm run expo:doctor && npm run export:ios && npm audit --audit-level=high`

Run: `cd ../ && node scripts/scan-secrets.mjs --tracked --paths mobile/dist && ruby -e 'require "yaml"; Dir[".github/workflows/*.{yml,yaml}"].each { |file| YAML.load_file(file); puts file }'`

Expected: all local commands PASS. Report signed build, device matrix, Apple/RevenueCat configuration, TestFlight, App Review, and publication as BLOCKED/UNCHECKED until their external evidence exists.

- [ ] **Step 8: Commit scale and release gates**

Stage only the literal Task 8 file list, require the cached name-status list to
equal that allowlist, inspect the cached diff, and commit with
`test: enforce Finova 25k release gates`. Reconcile already-dirty release files
line by line and never stage a directory wholesale.
