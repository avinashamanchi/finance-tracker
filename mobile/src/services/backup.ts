import { z } from 'zod';
import type { FinanceSnapshot } from '../domain/types';
import { validateSnapshot } from '../data/validation';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 1_048_576;

const TransactionSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['income', 'expense']),
  amountCents: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  categoryId: z.string().min(1).max(40),
  description: z.string().min(1).max(240),
  occurredOn: z.string().min(10).max(10),
  isRecurring: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

const BudgetSchema = z.object({
  categoryId: z.string().min(1).max(40),
  limitCents: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.string().datetime(),
}).strict();

const BackupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().datetime(),
  transactions: z.array(TransactionSchema).max(10_000),
  budgets: z.array(BudgetSchema).max(18),
}).strict();

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes > MAX_BACKUP_BYTES) return bytes;
  }
  return bytes;
}

export function serializeBackup(
  snapshot: FinanceSnapshot,
  now: () => string = () => new Date().toISOString(),
): string {
  const valid = validateSnapshot(snapshot);
  const exportedAt = now();
  if (Number.isNaN(Date.parse(exportedAt))) throw new Error('Invalid backup timestamp.');
  const raw = JSON.stringify({ version: BACKUP_VERSION, exportedAt, ...valid }, null, 2);
  if (utf8ByteLength(raw) > MAX_BACKUP_BYTES) {
    throw new Error('Finova backups cannot exceed 1 MiB.');
  }
  return raw;
}

export function parseBackup(raw: string): FinanceSnapshot {
  if (utf8ByteLength(raw) > MAX_BACKUP_BYTES) {
    throw new Error('Finova backups cannot exceed 1 MiB.');
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error('This is not a valid Finova backup.');
  }

  if (
    typeof candidate === 'object'
    && candidate !== null
    && 'version' in candidate
    && (candidate as { version?: unknown }).version !== BACKUP_VERSION
  ) {
    throw new Error('This Finova backup uses an unsupported version.');
  }

  const parsed = BackupSchema.safeParse(candidate);
  if (!parsed.success) throw new Error('This is not a valid Finova backup.');
  return validateSnapshot({
    transactions: parsed.data.transactions,
    budgets: parsed.data.budgets,
  } as FinanceSnapshot);
}
