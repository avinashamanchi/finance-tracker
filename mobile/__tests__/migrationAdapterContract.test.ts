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
  const sourceFor = (database: MigrationDatabase, allowExclusive: boolean): ExpoMigrationDatabaseSource => ({
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

async function retryLocked(work: () => Promise<void>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await work();
      return;
    } catch (error) {
      const message = typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);
      if (!/locked/i.test(message) || attempt === 99) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}

function independentExpoSource(
  database: NodeMigrationAdapter,
  legacyExclusiveCalled: () => void,
): ExpoMigrationDatabaseSource {
  return {
    execAsync: (sql) => retryLocked(() => database.exec(sql)),
    runAsync: async (sql, params = []) => {
      await database.run(sql, params);
    },
    getFirstAsync: database.first,
    getAllAsync: database.all,
    withExclusiveTransactionAsync: async () => {
      legacyExclusiveCalled();
      throw new Error('Production migration locking must not delegate to Expo deferred transactions.');
    },
  };
}

it('serializes two production Expo adapters on independent connections before structural reads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'finova-production-lock-'));
  const filename = join(directory, 'production.sqlite');
  const firstConnection = new NodeMigrationAdapter(filename);
  const secondConnection = new NodeMigrationAdapter(filename);
  let legacyExclusiveCalls = 0;
  const first = createExpoMigrationDatabase(independentExpoSource(
    firstConnection,
    () => { legacyExclusiveCalls += 1; },
  ));
  const second = createExpoMigrationDatabase(independentExpoSource(
    secondConnection,
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
    expect(await firstConnection.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await secondConnection.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await firstConnection.first('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect(await secondConnection.first('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect(await firstConnection.first('SELECT count(*) AS count FROM ledgers')).toEqual({ count: 1 });
  } finally {
    firstConnection.close();
    secondConnection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('configures and reserves the original Expo connection before work, then commits or rolls back there', async () => {
  const events: string[] = [];
  const source: ExpoMigrationDatabaseSource = {
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
    'exec:BEGIN IMMEDIATE',
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
    'exec:BEGIN IMMEDIATE',
    'failing-work',
    'exec:ROLLBACK',
  ]);
});
