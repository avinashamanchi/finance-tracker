import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  configureConnection,
  createExpoMigrationDatabase,
  type ExpoMigrationDatabaseSource,
} from '../src/data/configureConnection';
import type { MigrationDatabase } from '../src/data/migrations/types';
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
