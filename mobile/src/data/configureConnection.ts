import type {
  MigrationBindValue,
  MigrationDatabase,
} from './migrations/types';

const BUSY_TIMEOUT_MS = 1_000;
const MAX_LOCK_ACQUISITION_MS = 15_000;
const INITIAL_RETRY_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 250;

type DatabaseQueue = {
  pending: number;
  tail: Promise<void>;
};

const databaseQueues = new Map<string, DatabaseQueue>();

export interface ExpoMigrationDatabaseSource {
  readonly databasePath: string;
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: readonly MigrationBindValue[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, params?: readonly MigrationBindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: readonly MigrationBindValue[]): Promise<readonly T[]>;
  withExclusiveTransactionAsync?(
    work: (transaction: ExpoMigrationDatabaseSource) => Promise<void>,
  ): Promise<void>;
}

export type SQLiteLockRetryOptions = Readonly<{
  timeoutMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}>;

export type ExpoMigrationDatabaseOptions = Readonly<{
  lockRetry?: SQLiteLockRetryOptions;
}>;

type ResolvedLockRetryOptions = Readonly<{
  timeoutMs: number;
  now: () => number;
  sleep: (delayMs: number) => Promise<void>;
}>;

export function sqliteDatabaseIdentity(databasePath: string): string {
  if (typeof databasePath !== 'string' || databasePath.trim().length === 0) {
    throw new Error('SQLite database path is required for coordinated access.');
  }
  return `sqlite:${databasePath}`;
}

export async function serializeDatabaseAccess<T>(
  identity: string,
  work: () => Promise<T>,
): Promise<T> {
  if (typeof identity !== 'string' || identity.length === 0) {
    throw new Error('SQLite database identity is required for coordinated access.');
  }
  let queue = databaseQueues.get(identity);
  if (!queue) {
    queue = { pending: 0, tail: Promise.resolve() };
    databaseQueues.set(identity, queue);
  }
  queue.pending += 1;
  const predecessor = queue.tail.catch(() => undefined);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  queue.tail = predecessor.then(() => gate);

  await predecessor;
  try {
    return await work();
  } finally {
    release();
    queue.pending -= 1;
    if (queue.pending === 0 && databaseQueues.get(identity) === queue) {
      databaseQueues.delete(identity);
    }
  }
}

function resolveLockRetryOptions(options?: SQLiteLockRetryOptions): ResolvedLockRetryOptions {
  const timeoutMs = options?.timeoutMs ?? MAX_LOCK_ACQUISITION_MS;
  if (
    !Number.isFinite(timeoutMs)
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 0
    || timeoutMs > MAX_LOCK_ACQUISITION_MS
  ) {
    throw new Error('SQLite lock retry timeout must be an integer from 0 to 15000 milliseconds.');
  }
  return {
    timeoutMs,
    now: options?.now ?? (() => (
      typeof globalThis.performance?.now === 'function'
        ? globalThis.performance.now()
        : Date.now()
    )),
    sleep: options?.sleep ?? ((delayMs) => (
      new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    )),
  };
}

function readRetryClock(now: () => number): number {
  const value = now();
  if (!Number.isFinite(value)) throw new Error('SQLite lock retry clock returned an invalid value.');
  return value;
}

function isSQLiteLockError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';
  return code === '5'
    || code === '6'
    || /^SQLITE_(?:BUSY|LOCKED)/i.test(code)
    || /database (?:table )?(?:is )?(?:busy|locked)/i.test(message);
}

function lockTimeoutError(timeoutMs: number, cause: unknown): Error {
  const failure = new Error(
    `SQLite write lock could not be acquired within ${timeoutMs} milliseconds.`,
  );
  Object.assign(failure, { cause });
  return failure;
}

async function beginImmediateWithRetry(
  source: ExpoMigrationDatabaseSource,
  options: ResolvedLockRetryOptions,
): Promise<void> {
  const startedAt = readRetryClock(options.now);
  let attempt = 0;
  let lastLockError: unknown;
  while (true) {
    const elapsedBeforeAttempt = Math.max(0, readRetryClock(options.now) - startedAt);
    if (lastLockError !== undefined && elapsedBeforeAttempt >= options.timeoutMs) {
      throw lockTimeoutError(options.timeoutMs, lastLockError);
    }
    const remainingBeforeAttempt = Math.max(0, options.timeoutMs - elapsedBeforeAttempt);
    const attemptBusyTimeout = Math.min(BUSY_TIMEOUT_MS, Math.floor(remainingBeforeAttempt));
    await source.execAsync(`PRAGMA busy_timeout = ${attemptBusyTimeout}`);
    try {
      await source.execAsync('BEGIN IMMEDIATE');
      return;
    } catch (error) {
      await source.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
      if (!isSQLiteLockError(error)) throw error;
      lastLockError = error;
      const elapsed = Math.max(0, readRetryClock(options.now) - startedAt);
      const remaining = options.timeoutMs - elapsed;
      if (remaining <= 0) throw lockTimeoutError(options.timeoutMs, error);
      const exponentialDelay = INITIAL_RETRY_DELAY_MS * (2 ** Math.min(attempt, 4));
      await options.sleep(Math.min(MAX_RETRY_DELAY_MS, exponentialDelay, remaining));
      attempt += 1;
    }
  }
}

function expoAdapter(
  source: ExpoMigrationDatabaseSource,
  identity: string,
  lockRetry: ResolvedLockRetryOptions,
  mayStartTransaction: boolean,
): MigrationDatabase {
  return {
    identity,
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
        await beginImmediateWithRetry(source, lockRetry);
        transactionStarted = true;
        await source.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        const result = await work(expoAdapter(source, identity, lockRetry, false));
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

export function createExpoMigrationDatabase(
  source: ExpoMigrationDatabaseSource,
  options: ExpoMigrationDatabaseOptions = {},
): MigrationDatabase {
  return expoAdapter(
    source,
    sqliteDatabaseIdentity(source.databasePath),
    resolveLockRetryOptions(options.lockRetry),
    true,
  );
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
