import { configureConnection } from '../configureConnection';
import { initialMigration } from './001_initial';
import { ledgerCurrencyFtsMigration } from './002_ledger_currency_fts';
import { recurringMigration } from './003_recurring';
import { planningMigration } from './004_planning';
import type { Migration, MigrationContext, MigrationDatabase } from './types';

type MasterRow = Readonly<{
  type: 'table' | 'index' | 'trigger' | 'view';
  name: string;
  sql: string | null;
}>;

type TableInfoRow = Readonly<{
  name: string;
  type: string;
  notnull: number;
  pk: number;
}>;

const inflight = new WeakMap<MigrationDatabase, Promise<void>>();

export const LATEST_SCHEMA_VERSION = 4;

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  initialMigration,
  ledgerCurrencyFtsMigration,
  recurringMigration,
  planningMigration,
]);

const V1_TRANSACTIONS = [
  'id:TEXT:1:1',
  'kind:TEXT:1:0',
  'amount_cents:INTEGER:1:0',
  'category_id:TEXT:1:0',
  'description:TEXT:1:0',
  'occurred_on:TEXT:1:0',
  'is_recurring:INTEGER:1:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const V1_BUDGETS = [
  'category_id:TEXT:1:1',
  'limit_cents:INTEGER:1:0',
  'updated_at:TEXT:1:0',
] as const;

const LEDGERS = [
  'id:TEXT:1:1',
  'name:TEXT:1:0',
  'currency_code:TEXT:1:0',
  'currency_minor_unit:INTEGER:1:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const TRANSACTIONS = [
  'id:TEXT:1:1',
  'ledger_id:TEXT:1:0',
  'kind:TEXT:1:0',
  'amount_minor:INTEGER:1:0',
  'category_id:TEXT:1:0',
  'description:TEXT:1:0',
  'occurred_on:TEXT:1:0',
  'legacy_recurring:INTEGER:1:0',
  'source_template_id:TEXT:0:0',
  'source_due_on:TEXT:0:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const RECURRING_TEMPLATES = [
  'id:TEXT:1:1',
  'ledger_id:TEXT:1:0',
  'description:TEXT:1:0',
  'category_id:TEXT:1:0',
  'amount_minor:INTEGER:1:0',
  'due_day:INTEGER:1:0',
  'start_month:TEXT:1:0',
  'end_month:TEXT:0:0',
  'enabled:INTEGER:1:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const EXPECTED_OCCURRENCES = [
  'id:TEXT:1:1',
  'template_id:TEXT:1:0',
  'due_on:TEXT:1:0',
  'transaction_id:TEXT:0:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const BUDGET_PLANS = [
  'ledger_id:TEXT:1:1',
  'category_id:TEXT:1:2',
  'month:TEXT:1:3',
  'limit_minor:INTEGER:1:0',
  'rollover_policy:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const SAVINGS_GOALS = [
  'id:TEXT:1:1',
  'ledger_id:TEXT:1:0',
  'name:TEXT:1:0',
  'target_minor:INTEGER:1:0',
  'target_on:TEXT:0:0',
  'archived_at:TEXT:0:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;

const GOAL_CONTRIBUTIONS = [
  'id:TEXT:1:1',
  'goal_id:TEXT:1:0',
  'amount_minor:INTEGER:1:0',
  'occurred_on:TEXT:1:0',
  'note:TEXT:1:0',
  'created_at:TEXT:1:0',
] as const;

function normalizeSql(sql: string | null): string {
  return (sql ?? '').toLowerCase().replace(/\s+/g, '');
}

function validateMigrationCatalog(): void {
  if (MIGRATIONS.length !== LATEST_SCHEMA_VERSION) {
    throw new Error('Migration catalog does not reach the latest schema version.');
  }
  const names = new Set<string>();
  MIGRATIONS.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error('Migration versions must be contiguous from 1.');
    }
    if (!migration.name || names.has(migration.name)) {
      throw new Error('Migration names must be non-empty and unique.');
    }
    names.add(migration.name);
  });
}

function validateContext(context: MigrationContext): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    context.legacyLedgerId,
  )) {
    throw new Error('Migration ledger ID must be a canonical UUID.');
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(context.currentMonth)) {
    throw new Error('Migration current month must use YYYY-MM.');
  }
  const timestamp = Date.parse(context.nowIso);
  const canonicalTimestamp = context.nowIso.includes('.')
    ? context.nowIso
    : context.nowIso.replace(/Z$/, '.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(context.nowIso)
    || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString() !== canonicalTimestamp
  ) {
    throw new Error('Migration timestamp must be a valid UTC instant.');
  }
}

async function masterRows(database: MigrationDatabase): Promise<readonly MasterRow[]> {
  return database.all<MasterRow>(`
    SELECT type, name, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `);
}

async function assertColumns(
  database: MigrationDatabase,
  table: string,
  expected: readonly string[],
): Promise<void> {
  const rows = await database.all<TableInfoRow>(`PRAGMA table_info("${table}")`);
  const actual = rows.map((row) => `${row.name}:${row.type.toUpperCase()}:${row.notnull}:${row.pk}`);
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`Incompatible SQLite ${table} structure.`);
  }
}

function assertObjectSet(rows: readonly MasterRow[], expected: readonly string[]): void {
  const actual = rows
    .filter((row) => row.type !== 'index' || row.sql !== null)
    .map((row) => `${row.type}:${row.name}`)
    .sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((item, index) => item !== sortedExpected[index])
  ) {
    throw new Error('Unsupported or incompatible SQLite schema objects.');
  }
}

function tableSql(rows: readonly MasterRow[], table: string): string {
  const row = rows.find((candidate) => candidate.type === 'table' && candidate.name === table);
  if (!row) throw new Error(`Incompatible SQLite ${table} structure.`);
  return normalizeSql(row.sql);
}

function objectSql(rows: readonly MasterRow[], type: MasterRow['type'], name: string): string {
  const row = rows.find((candidate) => candidate.type === type && candidate.name === name);
  if (!row) throw new Error(`Incompatible SQLite ${name} object.`);
  return normalizeSql(row.sql);
}

function assertSqlFragments(sql: string, table: string, fragments: readonly string[]): void {
  if (fragments.some((fragment) => !sql.includes(normalizeSql(fragment)))) {
    throw new Error(`Incompatible SQLite ${table} constraints.`);
  }
}

const FTS_TABLES = [
  'table:transaction_fts',
  'table:transaction_fts_config',
  'table:transaction_fts_data',
  'table:transaction_fts_docsize',
  'table:transaction_fts_idx',
] as const;

const CORE_V2_OBJECTS = [
  'table:budgets',
  'table:ledgers',
  'table:transactions',
  ...FTS_TABLES,
  'index:transactions_ledger_month_kind',
  'index:transactions_ledger_order',
  'trigger:transactions_fts_delete',
  'trigger:transactions_fts_insert',
  'trigger:transactions_fts_update',
] as const;

const RECURRING_OBJECTS = [
  'table:expected_occurrences',
  'table:recurring_templates',
  'index:expected_occurrences_due',
  'index:recurring_templates_ledger_enabled',
] as const;

const PLANNING_OBJECTS = [
  'table:budget_plans',
  'table:goal_contributions',
  'table:savings_goals',
  'index:budget_plans_ledger_month',
  'index:goal_contributions_goal_order',
  'index:savings_goals_active_name',
] as const;

async function assertV1Tables(database: MigrationDatabase, rows: readonly MasterRow[]): Promise<void> {
  await assertColumns(database, 'transactions', V1_TRANSACTIONS);
  await assertColumns(database, 'budgets', V1_BUDGETS);
  assertSqlFragments(tableSql(rows, 'transactions'), 'transactions', [
    "check(kindin('income','expense'))",
    'check(amount_cents>0)',
    'check(is_recurringin(0,1))',
  ]);
  assertSqlFragments(tableSql(rows, 'budgets'), 'budgets', ['check(limit_cents>0)']);
}

async function assertV2Tables(database: MigrationDatabase, rows: readonly MasterRow[]): Promise<void> {
  await assertColumns(database, 'ledgers', LEDGERS);
  await assertColumns(database, 'transactions', TRANSACTIONS);
  assertSqlFragments(tableSql(rows, 'ledgers'), 'ledgers', [
    'length(name)between1and60',
    "currency_codeglob'[a-z][a-z][a-z]'",
    'currency_minor_unitbetween0and3',
  ]);
  assertSqlFragments(tableSql(rows, 'transactions'), 'transactions', [
    'referencesledgers(id)ondeletecascade',
    "check(kindin('income','expense'))",
    "typeof(amount_minor)='integer'",
    'amount_minorbetween1and9007199254740991',
    'check(legacy_recurringin(0,1))',
    'unique(source_template_id,source_due_on)',
  ]);
  assertSqlFragments(tableSql(rows, 'transaction_fts'), 'transaction_fts', [
    "usingfts5(description,category_id,content='transactions',content_rowid='rowid'",
  ]);
  assertSqlFragments(objectSql(rows, 'index', 'transactions_ledger_order'), 'transactions_ledger_order', [
    'ontransactions(ledger_id,occurred_ondesc,created_atdesc,iddesc)',
  ]);
  assertSqlFragments(objectSql(rows, 'index', 'transactions_ledger_month_kind'), 'transactions_ledger_month_kind', [
    'ontransactions(ledger_id,occurred_on,kind,category_id)',
  ]);
  assertSqlFragments(objectSql(rows, 'trigger', 'transactions_fts_insert'), 'transactions_fts_insert', [
    'afterinsertontransactions',
    'insertintotransaction_fts(rowid,description,category_id)values(new.rowid,new.description,new.category_id)',
  ]);
  assertSqlFragments(objectSql(rows, 'trigger', 'transactions_fts_delete'), 'transactions_fts_delete', [
    'afterdeleteontransactions',
    "values('delete',old.rowid,old.description,old.category_id)",
  ]);
  assertSqlFragments(objectSql(rows, 'trigger', 'transactions_fts_update'), 'transactions_fts_update', [
    'afterupdateontransactions',
    "values('delete',old.rowid,old.description,old.category_id)",
    'values(new.rowid,new.description,new.category_id)',
  ]);
  const ledgerCount = await database.first<{ count: number }>('SELECT count(*) AS count FROM ledgers');
  if (ledgerCount?.count !== 1) throw new Error('Incompatible SQLite ledger identity state.');
}

async function assertV3Tables(database: MigrationDatabase, rows: readonly MasterRow[]): Promise<void> {
  await assertColumns(database, 'recurring_templates', RECURRING_TEMPLATES);
  await assertColumns(database, 'expected_occurrences', EXPECTED_OCCURRENCES);
  assertSqlFragments(tableSql(rows, 'recurring_templates'), 'recurring_templates', [
    'referencesledgers(id)ondeletecascade',
    "typeof(amount_minor)='integer'",
    'amount_minorbetween1and9007199254740991',
    'check(due_daybetween1and31)',
  ]);
  assertSqlFragments(tableSql(rows, 'expected_occurrences'), 'expected_occurrences', [
    'referencesrecurring_templates',
    'unique(template_id,due_on)',
  ]);
}

async function assertV4Tables(database: MigrationDatabase, rows: readonly MasterRow[]): Promise<void> {
  await assertColumns(database, 'budget_plans', BUDGET_PLANS);
  await assertColumns(database, 'savings_goals', SAVINGS_GOALS);
  await assertColumns(database, 'goal_contributions', GOAL_CONTRIBUTIONS);
  assertSqlFragments(tableSql(rows, 'budget_plans'), 'budget_plans', [
    'referencesledgers(id)ondeletecascade',
    "typeof(limit_minor)='integer'",
    'limit_minorbetween0and9007199254740991',
  ]);
  assertSqlFragments(tableSql(rows, 'savings_goals'), 'savings_goals', [
    'referencesledgers(id)ondeletecascade',
    "typeof(target_minor)='integer'",
    'target_minorbetween1and9007199254740991',
  ]);
  assertSqlFragments(tableSql(rows, 'goal_contributions'), 'goal_contributions', [
    'referencessavings_goals(id)ondeletecascade',
    "typeof(amount_minor)='integer'",
    'amount_minorbetween0and9007199254740991',
  ]);
}

async function validateStructure(database: MigrationDatabase, version: number): Promise<void> {
  const rows = await masterRows(database);
  if (version === 0) {
    if (rows.length === 0) return;
    const allowed = new Set([
      'table:budgets',
      'table:transactions',
      'index:transactions_occurred_on',
    ]);
    const actual = rows
      .filter((row) => row.type !== 'index' || row.sql !== null)
      .map((row) => `${row.type}:${row.name}`);
    if (actual.some((object) => !allowed.has(object))) {
      throw new Error('Unsupported or incompatible SQLite v0 state.');
    }
    if (rows.some((row) => row.type === 'table' && row.name === 'transactions')) {
      await assertColumns(database, 'transactions', V1_TRANSACTIONS);
      assertSqlFragments(tableSql(rows, 'transactions'), 'transactions', [
        "check(kindin('income','expense'))",
        'check(amount_cents>0)',
        'check(is_recurringin(0,1))',
      ]);
    }
    if (rows.some((row) => row.type === 'table' && row.name === 'budgets')) {
      await assertColumns(database, 'budgets', V1_BUDGETS);
      assertSqlFragments(tableSql(rows, 'budgets'), 'budgets', ['check(limit_cents>0)']);
    }
    return;
  }
  if (version === 1) {
    assertObjectSet(rows, [
      'table:budgets',
      'table:transactions',
      'index:transactions_occurred_on',
    ]);
    await assertV1Tables(database, rows);
    return;
  }
  if (version === 2) {
    assertObjectSet(rows, CORE_V2_OBJECTS);
    await assertColumns(database, 'budgets', V1_BUDGETS);
    await assertV2Tables(database, rows);
    return;
  }
  if (version === 3) {
    assertObjectSet(rows, [...CORE_V2_OBJECTS, ...RECURRING_OBJECTS]);
    await assertColumns(database, 'budgets', V1_BUDGETS);
    await assertV2Tables(database, rows);
    await assertV3Tables(database, rows);
    return;
  }
  if (version === 4) {
    const coreWithoutBudgets = CORE_V2_OBJECTS.filter((item) => item !== 'table:budgets');
    assertObjectSet(rows, [...coreWithoutBudgets, ...RECURRING_OBJECTS, ...PLANNING_OBJECTS]);
    await assertV2Tables(database, rows);
    await assertV3Tables(database, rows);
    await assertV4Tables(database, rows);
    return;
  }
  throw new Error(`Unsupported SQLite schema version ${version}.`);
}

async function performMigrations(
  database: MigrationDatabase,
  context: MigrationContext,
): Promise<void> {
  validateMigrationCatalog();
  validateContext(context);
  await configureConnection(database);
  await database.exclusive(async (transaction) => {
    const versionRow = await transaction.first<{ user_version: number }>('PRAGMA user_version');
    const version = versionRow?.user_version;
    if (!Number.isInteger(version) || version === undefined || version < 0 || version > LATEST_SCHEMA_VERSION) {
      throw new Error(`Unsupported SQLite schema version ${String(version)}.`);
    }
    await validateStructure(transaction, version);
    for (const migration of MIGRATIONS) {
      if (migration.version <= version) continue;
      await migration.up(transaction, context);
      await transaction.exec(`PRAGMA user_version = ${migration.version}`);
    }
    await validateStructure(transaction, LATEST_SCHEMA_VERSION);
    const foreignKeyFailures = await transaction.all('PRAGMA foreign_key_check');
    if (foreignKeyFailures.length !== 0) {
      throw new Error('SQLite migration produced foreign key violations.');
    }
  });
}

export function runMigrations(
  database: MigrationDatabase,
  context: MigrationContext,
): Promise<void> {
  const existing = inflight.get(database);
  if (existing) return existing;
  const operation = performMigrations(database, context);
  inflight.set(database, operation);
  void operation.finally(() => {
    if (inflight.get(database) === operation) inflight.delete(database);
  }).catch(() => undefined);
  return operation;
}
