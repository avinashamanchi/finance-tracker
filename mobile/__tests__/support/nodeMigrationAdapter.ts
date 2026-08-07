import { DatabaseSync } from 'node:sqlite';

import type { MigrationDatabase } from '../../src/data/migrations/types';

type BindValue = string | number | null;

export class NodeMigrationAdapter implements MigrationDatabase {
  private readonly database: DatabaseSync;

  constructor(readonly filename: string) {
    this.database = new DatabaseSync(filename, {
      enableForeignKeyConstraints: false,
      timeout: 50,
    });
  }

  readonly exec = async (sql: string): Promise<void> => {
    this.database.exec(sql);
  };

  readonly run = async (sql: string, params: readonly BindValue[] = []): Promise<void> => {
    this.database.prepare(sql).run(...params);
  };

  readonly first = async <T>(sql: string, params: readonly BindValue[] = []): Promise<T | null> => {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  };

  readonly all = async <T>(sql: string, params: readonly BindValue[] = []): Promise<readonly T[]> => {
    return this.database.prepare(sql).all(...params) as T[];
  };

  readonly exclusive = async <T>(work: (transaction: MigrationDatabase) => Promise<T>): Promise<T> => {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(this.transactionView());
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  };

  close(): void {
    this.database.close();
  }

  private transactionView(): MigrationDatabase {
    return {
      exec: this.exec,
      run: this.run,
      first: this.first,
      all: this.all,
      exclusive: async () => {
        throw new Error('Nested migration transactions are not supported.');
      },
    };
  }
}

// Jest discovers every TypeScript file below __tests__. When this mandated support
// path is executed directly, keep it a real behavioral check instead of an empty suite.
if (expect.getState().testPath === __filename) {
  it('executes bound parameterized statements when Jest discovers the adapter directly', async () => {
    const database = new NodeMigrationAdapter(':memory:');
    try {
      const { exec, run, first } = database;
      await exec('CREATE TABLE direct_check(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      await run('INSERT INTO direct_check(id, value) VALUES(?, ?)', [1, 'bound']);
      await expect(first('SELECT value FROM direct_check WHERE id = ?', [1]))
        .resolves.toEqual({ value: 'bound' });
    } finally {
      database.close();
    }
  });
}
