import type {
  MigrationBindValue,
  MigrationDatabase,
} from './migrations/types';

const BUSY_TIMEOUT_MS = 1_000;

export interface ExpoMigrationDatabaseSource {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: readonly MigrationBindValue[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, params?: readonly MigrationBindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: readonly MigrationBindValue[]): Promise<readonly T[]>;
  withExclusiveTransactionAsync?(
    work: (transaction: ExpoMigrationDatabaseSource) => Promise<void>,
  ): Promise<void>;
}

function expoAdapter(
  source: ExpoMigrationDatabaseSource,
  mayStartTransaction: boolean,
): MigrationDatabase {
  return {
    exec: async (sql) => {
      await source.execAsync(sql);
    },
    run: async (sql, params = []) => {
      await source.runAsync(sql, [...params]);
    },
    first: async <T>(sql: string, params: readonly MigrationBindValue[] = []) => (
      source.getFirstAsync<T>(sql, [...params])
    ),
    all: async <T>(sql: string, params: readonly MigrationBindValue[] = []) => (
      source.getAllAsync<T>(sql, [...params])
    ),
    exclusive: async <T>(work: (transaction: MigrationDatabase) => Promise<T>) => {
      if (!mayStartTransaction) {
        throw new Error('Nested migration transactions are not supported.');
      }
      let transactionStarted = false;
      try {
        await source.execAsync('BEGIN IMMEDIATE');
        transactionStarted = true;
        const result = await work(expoAdapter(source, false));
        await source.execAsync('COMMIT');
        transactionStarted = false;
        return result;
      } catch (error) {
        if (transactionStarted) {
          try {
            await source.execAsync('ROLLBACK');
          } catch (rollbackError) {
            const failure = new Error('SQLite migration failed and its rollback also failed.');
            Object.assign(failure, { cause: error, rollbackError });
            throw failure;
          }
        }
        throw error;
      }
    },
  };
}

export function createExpoMigrationDatabase(source: ExpoMigrationDatabaseSource): MigrationDatabase {
  return expoAdapter(source, true);
}

export async function configureConnection(database: MigrationDatabase): Promise<void> {
  await database.exec(`
    PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const journal = await database.first<{ journal_mode: string }>('PRAGMA journal_mode');
  const foreignKeys = await database.first<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const busyTimeout = await database.first<{ timeout: number }>('PRAGMA busy_timeout');
  if (journal?.journal_mode.toLowerCase() !== 'wal') {
    throw new Error('SQLite WAL mode could not be enabled.');
  }
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error('SQLite foreign key enforcement could not be enabled.');
  }
  if (
    busyTimeout === null
    || !Number.isInteger(busyTimeout.timeout)
    || busyTimeout.timeout < 100
    || busyTimeout.timeout > 5_000
  ) {
    throw new Error('SQLite busy timeout could not be bounded.');
  }
}
