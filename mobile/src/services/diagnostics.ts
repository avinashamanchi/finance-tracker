import { z } from 'zod';

export type DatabaseSizeBucket =
  | '<1 MiB'
  | '1-4 MiB'
  | '4-8 MiB'
  | '8-16 MiB'
  | '16-32 MiB'
  | '32-64 MiB'
  | '64+ MiB';

export type DiagnosticsReport = Readonly<{
  formatVersion: 1;
  appVersion: string;
  buildNumber: string;
  osVersion: string;
  schemaVersion: number;
  rowCounts: Readonly<Record<'transactions' | 'budgets' | 'templates' | 'goals', number>>;
  databaseSizeBucket: DatabaseSizeBucket;
  timingsMs: Readonly<{ firstPage: number; aggregate: number }>;
  errorCodes: readonly string[];
}>;

const DiagnosticInputSchema = z.object({
  appVersion: z.string().regex(/^\d+(?:\.\d+){0,3}(?:-[A-Za-z0-9.]+)?$/).max(32),
  buildNumber: z.string().regex(/^\d{1,18}$/),
  osVersion: z.string().regex(/^[A-Za-z0-9 ._-]{1,40}$/),
  schemaVersion: z.number().int().min(1).max(10_000),
  counts: z.object({
    transactions: z.number().int().min(0).max(100_000),
    budgets: z.number().int().min(0).max(100_000),
    templates: z.number().int().min(0).max(10_000),
    goals: z.number().int().min(0).max(10_000),
  }).strict(),
  databaseBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  timingsMs: z.object({
    firstPage: z.number().finite().min(0).max(60_000),
    aggregate: z.number().finite().min(0).max(60_000),
  }).strict(),
  errorCodes: z.array(z.enum([
    'DB_OPEN_FAILED',
    'DB_MIGRATION_FAILED',
    'DB_LOCK_TIMEOUT',
    'BACKUP_INVALID',
    'ARTIFACT_CLEANUP_FAILED',
    'BILLING_UNAVAILABLE',
  ])).max(20),
}).passthrough();

function bucketSize(bytes: number): DatabaseSizeBucket {
  const mib = 1024 * 1024;
  if (bytes < mib) return '<1 MiB';
  if (bytes < 4 * mib) return '1-4 MiB';
  if (bytes < 8 * mib) return '4-8 MiB';
  if (bytes < 16 * mib) return '8-16 MiB';
  if (bytes < 32 * mib) return '16-32 MiB';
  if (bytes < 64 * mib) return '32-64 MiB';
  return '64+ MiB';
}

export function buildDiagnostics(input: unknown): DiagnosticsReport {
  const parsed = DiagnosticInputSchema.safeParse(input);
  if (!parsed.success) throw new Error('Finova diagnostic input is invalid.');
  const value = parsed.data;
  return {
    formatVersion: 1,
    appVersion: value.appVersion,
    buildNumber: value.buildNumber,
    osVersion: value.osVersion,
    schemaVersion: value.schemaVersion,
    rowCounts: {
      transactions: value.counts.transactions,
      budgets: value.counts.budgets,
      templates: value.counts.templates,
      goals: value.counts.goals,
    },
    databaseSizeBucket: bucketSize(value.databaseBytes),
    timingsMs: {
      firstPage: Math.round(value.timingsMs.firstPage),
      aggregate: Math.round(value.timingsMs.aggregate),
    },
    errorCodes: [...new Set(value.errorCodes)],
  };
}
