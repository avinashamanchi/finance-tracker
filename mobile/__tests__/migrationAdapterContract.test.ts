import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  configureConnection,
  createExpoMigrationDatabase,
  type ExpoMigrationDatabaseSource,
} from '../src/data/configureConnection';
import type { MigrationDatabase } from '../src/data/migrations/types';
import { runMigrations } from '../src/data/migrations';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

type Harness = Readonly<{
  database: MigrationDatabase;
  close(): void;
}>;

function createNativeHarness(filename: string): Harness {
  const database = new NodeMigrationAdapter(filename);
  return { database, close: () => database.close() };
}

function createExpoHarness(filename: string): Harness {
  const node = new NodeMigrationAdapter(filename);
  const sourceFor = (
    database: MigrationDatabase,
    allowExclusive: boolean,
  ): ExpoMigrationDatabaseSource & { readonly databasePath: string } => ({
    databasePath: filename,
    execAsync: database.exec,
    runAsync: async (sql, params = []) => {
      await database.run(sql, params);
    },
    getFirstAsync: database.first,
    getAllAsync: database.all,
    withExclusiveTransactionAsync: allowExclusive
      ? async (work) => database.exclusive(async (transaction) => work(sourceFor(transaction, false)))
      : undefined,
  });
  return {
    database: createExpoMigrationDatabase(sourceFor(node, true)),
    close: () => node.close(),
  };
}

const harnesses = [
  ['Node', createNativeHarness],
  ['Expo boundary', createExpoHarness],
] as const;

describe.each(harnesses)('%s migration adapter', (_name, createHarness) => {
  let directory: string;
  let harness: Harness;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'finova-adapter-'));
    harness = createHarness(join(directory, 'adapter.sqlite'));
    await configureConnection(harness.database);
  });

  afterEach(() => {
    harness.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps exec, run, first, all, and exclusive bound and parameterized', async () => {
    const { exec, run, first, all, exclusive } = harness.database;
    await exec('CREATE TABLE values_table(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    await run('INSERT INTO values_table(id, value) VALUES(?, ?)', [1, 'one']);
    await run('INSERT INTO values_table(id, value) VALUES(?, ?)', [2, 'two']);

    expect(await first<{ value: string }>('SELECT value FROM values_table WHERE id = ?', [2]))
      .toEqual({ value: 'two' });
    expect(await all<{ id: number }>('SELECT id FROM values_table ORDER BY id'))
      .toEqual([{ id: 1 }, { id: 2 }]);
    await expect(exclusive(async (transaction) => {
      await transaction.run('INSERT INTO values_table(id, value) VALUES(?, ?)', [3, 'three']);
      return 'committed';
    })).resolves.toBe('committed');
  });

  it('rolls back every transaction side effect when work throws', async () => {
    await harness.database.exec('CREATE TABLE rollback_table(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    await expect(harness.database.exclusive(async (transaction) => {
      await transaction.run('INSERT INTO rollback_table(id, value) VALUES(?, ?)', [1, 'discard']);
      throw new Error('injected');
    })).rejects.toThrow('injected');
    expect(await harness.database.all('SELECT * FROM rollback_table')).toEqual([]);
  });
});

describe('connection and lock contract', () => {
  let directory: string;
  let first: NodeMigrationAdapter;
  let second: NodeMigrationAdapter;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'finova-lock-'));
    const filename = join(directory, 'lock.sqlite');
    first = new NodeMigrationAdapter(filename);
    second = new NodeMigrationAdapter(filename);
    await configureConnection(first);
    await configureConnection(second);
  });

  afterEach(() => {
    first.close();
    second.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('sets and verifies WAL, foreign keys, and a bounded busy timeout', async () => {
    expect(await first.first('PRAGMA journal_mode')).toEqual({ journal_mode: 'wal' });
    expect(await first.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    const timeout = await first.first<{ timeout: number }>('PRAGMA busy_timeout');
    expect(timeout?.timeout).toBeGreaterThanOrEqual(100);
    expect(timeout?.timeout).toBeLessThanOrEqual(5_000);
  });

  it('acquires a write lock before invoking exclusive work', async () => {
    await first.exec('CREATE TABLE lock_table(id INTEGER PRIMARY KEY)');
    await second.exec('PRAGMA busy_timeout = 1');
    await first.exclusive(async (transaction) => {
      await transaction.run('INSERT INTO lock_table(id) VALUES(?)', [1]);
      await expect(second.run('INSERT INTO lock_table(id) VALUES(?)', [2])).rejects.toThrow(/locked/i);
    });
    expect(await first.all('SELECT id FROM lock_table')).toEqual([{ id: 1 }]);
  });
});

function independentExpoSource(
  database: NodeMigrationAdapter,
  databasePath: string,
  observedVersions: number[],
  legacyExclusiveCalled: () => void,
): ExpoMigrationDatabaseSource & { readonly databasePath: string } {
  return {
    databasePath,
    execAsync: database.exec,
    runAsync: async (sql, params = []) => {
      await database.run(sql, params);
    },
    getFirstAsync: async <T>(sql: string, params = []) => {
      const row = await database.first<T>(sql, params);
      if (sql === 'PRAGMA user_version' && row !== null) {
        observedVersions.push((row as { user_version: number }).user_version);
      }
      return row;
    },
    getAllAsync: database.all,
    withExclusiveTransactionAsync: async () => {
      legacyExclusiveCalled();
      throw new Error('Production migration locking must not delegate to Expo deferred transactions.');
    },
  };
}

it('serializes distinct production Expo adapters that share one cached native database path', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'finova-production-lock-'));
  const filename = join(directory, 'production.sqlite');
  const cachedNativeConnection = new NodeMigrationAdapter(filename);
  let legacyExclusiveCalls = 0;
  const firstObservedVersions: number[] = [];
  const secondObservedVersions: number[] = [];
  const first = createExpoMigrationDatabase(independentExpoSource(
    cachedNativeConnection,
    filename,
    firstObservedVersions,
    () => { legacyExclusiveCalls += 1; },
  ));
  const second = createExpoMigrationDatabase(independentExpoSource(
    cachedNativeConnection,
    filename,
    secondObservedVersions,
    () => { legacyExclusiveCalls += 1; },
  ));
  try {
    await Promise.all([
      runMigrations(first, {
        legacyLedgerId: '40000000-0000-4000-8000-000000000004',
        currentMonth: '2026-08',
        nowIso: '2026-08-07T20:00:00.000Z',
      }),
      runMigrations(second, {
        legacyLedgerId: '50000000-0000-4000-8000-000000000005',
        currentMonth: '2026-08',
        nowIso: '2026-08-07T20:00:01.000Z',
      }),
    ]);
    expect(legacyExclusiveCalls).toBe(0);
    expect(firstObservedVersions.at(-1)).toBe(4);
    expect(secondObservedVersions.at(-1)).toBe(4);
    expect(await cachedNativeConnection.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await cachedNativeConnection.first('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect(await cachedNativeConnection.first('SELECT count(*) AS count FROM ledgers'))
      .toEqual({ count: 1 });
  } finally {
    cachedNativeConnection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('retries a real second SQLite connection until an external write lock releases', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'finova-real-retry-'));
  const filename = join(directory, 'retry.sqlite');
  const lockHolder = new NodeMigrationAdapter(filename);
  const contender = new NodeMigrationAdapter(filename);
  const contenderDatabase = createExpoMigrationDatabase(independentExpoSource(
    contender,
    filename,
    [],
    () => { throw new Error('Deferred Expo transaction helper must not run.'); },
  ));
  try {
    await configureConnection(lockHolder);
    await configureConnection(contender);
    await lockHolder.exec('CREATE TABLE retry_table(id INTEGER PRIMARY KEY)');
    let contenderWrite!: Promise<void>;
    await lockHolder.exclusive(async (transaction) => {
      await transaction.run('INSERT INTO retry_table(id) VALUES(?)', [1]);
      contenderWrite = contenderDatabase.exclusive(async (contenderTransaction) => {
        await contenderTransaction.run('INSERT INTO retry_table(id) VALUES(?)', [2]);
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });
    await contenderWrite;

    expect(await lockHolder.all('SELECT id FROM retry_table ORDER BY id'))
      .toEqual([{ id: 1 }, { id: 2 }]);
  } finally {
    lockHolder.close();
    contender.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('caps a real blocking BEGIN attempt to the remaining acquisition deadline', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'finova-real-deadline-'));
  const filename = join(directory, 'deadline.sqlite');
  const lockHolder = new NodeMigrationAdapter(filename);
  const contender = new NodeMigrationAdapter(filename);
  const contenderDatabase = createExpoMigrationDatabase(independentExpoSource(
    contender,
    filename,
    [],
    () => { throw new Error('Deferred Expo transaction helper must not run.'); },
  ), { lockRetry: { timeoutMs: 250 } });
  try {
    await configureConnection(lockHolder);
    await configureConnection(contender);
    let elapsedMs = 0;
    await lockHolder.exclusive(async () => {
      const startedAt = performance.now();
      await expect(contenderDatabase.exclusive(async () => undefined))
        .rejects.toThrow(/250 milliseconds/i);
      elapsedMs = performance.now() - startedAt;
    });

    expect(elapsedMs).toBeGreaterThanOrEqual(150);
    expect(elapsedMs).toBeLessThan(750);
    expect(await contender.first('PRAGMA busy_timeout')).toEqual({ timeout: 1000 });
  } finally {
    lockHolder.close();
    contender.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects a fractional lock acquisition timeout before touching SQLite', () => {
  const source: ExpoMigrationDatabaseSource & { readonly databasePath: string } = {
    databasePath: '/documents/finova-fractional-timeout.sqlite',
    execAsync: async () => undefined,
    runAsync: async () => undefined,
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  };
  expect(() => createExpoMigrationDatabase(source, { lockRetry: { timeoutMs: 1.5 } }))
    .toThrow(/integer/i);
});

it('retries production BEGIN IMMEDIATE on SQLITE_BUSY with bounded deterministic backoff', async () => {
  let now = 1_000;
  let beginAttempts = 0;
  const delays: number[] = [];
  const source: ExpoMigrationDatabaseSource & { readonly databasePath: string } = {
    databasePath: '/documents/finova-retry.sqlite',
    execAsync: async (sql) => {
      if (sql !== 'BEGIN IMMEDIATE') return;
      beginAttempts += 1;
      if (beginAttempts < 3) {
        throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
      }
    },
    runAsync: async () => undefined,
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  };
  const database = createExpoMigrationDatabase(source, {
    lockRetry: {
      timeoutMs: 15_000,
      now: () => now,
      sleep: async (delayMs) => {
        delays.push(delayMs);
        now += delayMs;
      },
    },
  });

  await expect(database.exclusive(async () => 'acquired')).resolves.toBe('acquired');
  expect(beginAttempts).toBe(3);
  expect(delays).toHaveLength(2);
  expect(delays.every((delay) => delay > 0 && delay <= 250)).toBe(true);
  expect(delays.reduce((total, delay) => total + delay, 0)).toBeLessThan(15_000);
});

it('stops production SQLITE_LOCKED acquisition retry at the 15 second deadline', async () => {
  let now = 0;
  let beginAttempts = 0;
  const delays: number[] = [];
  const source: ExpoMigrationDatabaseSource & { readonly databasePath: string } = {
    databasePath: '/documents/finova-timeout.sqlite',
    execAsync: async (sql) => {
      if (sql !== 'BEGIN IMMEDIATE') return;
      beginAttempts += 1;
      throw Object.assign(new Error('database table is locked'), { code: 'SQLITE_LOCKED' });
    },
    runAsync: async () => undefined,
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  };
  const database = createExpoMigrationDatabase(source, {
    lockRetry: {
      timeoutMs: 15_000,
      now: () => now,
      sleep: async (delayMs) => {
        delays.push(delayMs);
        now += delayMs;
      },
    },
  });

  await expect(database.exclusive(async () => undefined)).rejects.toThrow(/15.?000|15 seconds/i);
  expect(now).toBe(15_000);
  expect(delays.reduce((total, delay) => total + delay, 0)).toBe(15_000);
  expect(beginAttempts).toBeGreaterThan(2);
});

it('configures and reserves the original Expo connection before work, then commits or rolls back there', async () => {
  const events: string[] = [];
  const source: ExpoMigrationDatabaseSource & { readonly databasePath: string } = {
    databasePath: '/documents/finova-order.sqlite',
    execAsync: async (sql) => {
      events.push(`exec:${sql.replace(/\s+/g, ' ').trim()}`);
    },
    runAsync: async (sql) => {
      events.push(`run:${sql}`);
    },
    getFirstAsync: async <T>(sql: string) => {
      events.push(`first:${sql}`);
      if (sql === 'PRAGMA journal_mode') return { journal_mode: 'wal' } as T;
      if (sql === 'PRAGMA foreign_keys') return { foreign_keys: 1 } as T;
      if (sql === 'PRAGMA busy_timeout') return { timeout: 1000 } as T;
      return null;
    },
    getAllAsync: async () => [],
    withExclusiveTransactionAsync: async (work) => {
      events.push('legacy-exclusive');
      await work(source);
    },
  };
  const database = createExpoMigrationDatabase(source);
  await configureConnection(database);
  await database.exclusive(async (transaction) => {
    events.push('work');
    await transaction.first('PRAGMA foreign_keys');
  });
  expect(events).toEqual([
    'exec:PRAGMA busy_timeout = 1000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
    'first:PRAGMA journal_mode',
    'first:PRAGMA foreign_keys',
    'first:PRAGMA busy_timeout',
    'exec:PRAGMA busy_timeout = 1000',
    'exec:BEGIN IMMEDIATE',
    'exec:PRAGMA busy_timeout = 1000',
    'work',
    'first:PRAGMA foreign_keys',
    'exec:COMMIT',
  ]);

  events.length = 0;
  await expect(database.exclusive(async () => {
    events.push('failing-work');
    throw new Error('injected work failure');
  })).rejects.toThrow('injected work failure');
  expect(events).toEqual([
    'exec:PRAGMA busy_timeout = 1000',
    'exec:BEGIN IMMEDIATE',
    'exec:PRAGMA busy_timeout = 1000',
    'failing-work',
    'exec:ROLLBACK',
  ]);
});
