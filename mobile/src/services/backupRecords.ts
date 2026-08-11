import { z } from 'zod';

import { isCategoryForKind, isExpenseCategory } from '../domain/categories';
import { validateMonth } from '../domain/recurrence';
import {
  hasUnpairedSurrogate,
  isCanonicalUuid,
  isValidDateKey,
  isValidIsoTimestamp,
  isValidTransactionId,
} from '../data/validation';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_RECORD_KINDS,
  FRAME_PLAINTEXT_BYTES,
  type BackupCounts,
  type BackupRecordKind,
} from './backupFormat';

export const FINOVA_APP_ID = 'com.avinashamanchi.finova';
export const BACKUP_SCHEMA_VERSION = 4;

const utf8 = new TextEncoder();
const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const canonicalUuid = z.string().refine(isCanonicalUuid);
const transactionId = z.string().refine(isValidTransactionId);
const dateKey = z.string().refine(isValidDateKey);
const timestamp = z.string().refine(isValidIsoTimestamp);
const nullableTimestamp = timestamp.nullable();
const month = z.string().refine((value) => {
  try {
    return validateMonth(value) === value;
  } catch {
    return false;
  }
});
const expenseCategory = z.string().refine(isExpenseCategory);
const boundedText = (minimum: number, maximum: number) => z.string().refine((value) => (
  value.trim() === value
  && Array.from(value).length >= minimum
  && Array.from(value).length <= maximum
  && !value.includes('\u0000')
  && !hasUnpairedSurrogate(value)
));

const CountsSchema = z.object(Object.fromEntries(
  BACKUP_RECORD_KINDS.map((kind) => [kind, z.number().int().min(0).max(1_000_000)]),
) as Record<BackupRecordKind, z.ZodNumber>).strict();

const ManifestRecordSchema = z.object({
  kind: z.literal('manifest'),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  appId: z.literal(FINOVA_APP_ID),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: timestamp,
  counts: CountsSchema,
}).strict();

const LedgerRecordSchema = z.object({
  kind: z.literal('ledger'),
  id: canonicalUuid,
  name: boundedText(1, 60),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  currencyMinorUnit: z.number().int().min(0).max(3),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const TransactionRecordSchema = z.object({
  kind: z.literal('transaction'),
  id: transactionId,
  ledgerId: canonicalUuid,
  transactionKind: z.enum(['income', 'expense']),
  amountMinor: positiveInteger,
  categoryId: boundedText(1, 40),
  description: boundedText(1, 120),
  occurredOn: dateKey,
  isRecurring: z.boolean(),
  sourceTemplateId: canonicalUuid.nullable(),
  sourceDueOn: dateKey.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict().superRefine((record, context) => {
  if (!isCategoryForKind(record.categoryId, record.transactionKind)) {
    context.addIssue({ code: 'custom', message: 'Transaction category is invalid.' });
  }
  if ((record.sourceTemplateId === null) !== (record.sourceDueOn === null)) {
    context.addIssue({ code: 'custom', message: 'Recurring source fields must be paired.' });
  }
});

const BudgetPlanRecordSchema = z.object({
  kind: z.literal('budget_plan'),
  ledgerId: canonicalUuid,
  categoryId: expenseCategory,
  month,
  limitMinor: safeInteger,
  rolloverPolicy: z.enum(['none', 'carry_unused']),
  updatedAt: timestamp,
}).strict();

const RecurringTemplateRecordSchema = z.object({
  kind: z.literal('recurring_template'),
  id: canonicalUuid,
  ledgerId: canonicalUuid,
  description: boundedText(1, 120),
  categoryId: expenseCategory,
  amountMinor: positiveInteger,
  dueDay: z.number().int().min(1).max(31),
  startMonth: month,
  endMonth: month.nullable(),
  enabled: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict().superRefine((record, context) => {
  if (record.endMonth !== null && record.endMonth < record.startMonth) {
    context.addIssue({ code: 'custom', message: 'Recurring month range is invalid.' });
  }
});

const ExpectedOccurrenceRecordSchema = z.object({
  kind: z.literal('expected_occurrence'),
  id: canonicalUuid,
  templateId: canonicalUuid,
  dueOn: dateKey,
  transactionId: transactionId.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const SavingsGoalRecordSchema = z.object({
  kind: z.literal('savings_goal'),
  id: canonicalUuid,
  ledgerId: canonicalUuid,
  name: boundedText(1, 80),
  targetMinor: positiveInteger,
  targetOn: dateKey.nullable(),
  archivedAt: nullableTimestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const GoalContributionRecordSchema = z.object({
  kind: z.literal('goal_contribution'),
  id: canonicalUuid,
  goalId: canonicalUuid,
  amountMinor: positiveInteger,
  occurredOn: dateKey,
  note: boundedText(0, 120),
  createdAt: timestamp,
}).strict();

export const BackupRecordSchema = z.discriminatedUnion('kind', [
  ManifestRecordSchema,
  LedgerRecordSchema,
  TransactionRecordSchema,
  BudgetPlanRecordSchema,
  RecurringTemplateRecordSchema,
  ExpectedOccurrenceRecordSchema,
  SavingsGoalRecordSchema,
  GoalContributionRecordSchema,
]);

export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type BackupManifest = z.infer<typeof ManifestRecordSchema>;
export type DataBackupRecord = Exclude<BackupRecord, BackupManifest>;
export type DataBackupRecordKind = Exclude<BackupRecordKind, 'manifest'>;

export function createManifest(counts: BackupCounts, exportedAt: string): BackupManifest {
  return ManifestRecordSchema.parse({
    kind: 'manifest',
    formatVersion: BACKUP_FORMAT_VERSION,
    appId: FINOVA_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    counts,
  });
}

export function encodeBackupRecord(record: BackupRecord): Uint8Array {
  const valid = BackupRecordSchema.parse(record);
  const bytes = utf8.encode(`${JSON.stringify(valid)}\n`);
  if (bytes.length < 2 || bytes.length > FRAME_PLAINTEXT_BYTES) {
    throw new Error('A Finova backup record exceeds 64 KiB.');
  }
  return bytes;
}

export function parseBackupRecord(line: Uint8Array): BackupRecord {
  if (line.length < 2 || line.length > FRAME_PLAINTEXT_BYTES || line[line.length - 1] !== 0x0a) {
    throw new Error('The backup password or file is invalid.');
  }
  let candidate: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(line.slice(0, -1));
    candidate = JSON.parse(text);
  } catch {
    throw new Error('The backup password or file is invalid.');
  }
  const parsed = BackupRecordSchema.safeParse(candidate);
  if (!parsed.success) throw new Error('The backup password or file is invalid.');
  return parsed.data;
}
