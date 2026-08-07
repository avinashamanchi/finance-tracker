export type MigrationBindValue = string | number | null;

export interface MigrationDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly MigrationBindValue[]): Promise<void>;
  first<T>(sql: string, params?: readonly MigrationBindValue[]): Promise<T | null>;
  all<T>(sql: string, params?: readonly MigrationBindValue[]): Promise<readonly T[]>;
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
