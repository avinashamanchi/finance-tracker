import * as Crypto from 'expo-crypto';
import type { ExpenseCategoryId } from '../domain/categories';
import { DataBoundaryError, LedgerCapacityError } from '../domain/errors';
import {
  enumerateMaterializationMonths,
  occurrenceStatus,
  resolveMonthlyDueDate,
  type ExpectedBill,
  type RecurringTemplate,
  type RecurringTemplateDraft,
  validateRecurringTemplateDraft,
} from '../domain/recurrence';
import type { Transaction } from '../domain/types';
import {
  isCanonicalUuid,
  isUuidV4,
  isValidDateKey,
  isValidIsoTimestamp,
  MAX_LEDGER_TRANSACTIONS,
  validateTransaction,
} from './validation';
import { serializeDatabaseAccess } from './configureConnection';
import type { MigrationDatabase } from './migrations';

type Options = Readonly<{
  now?: () => Date;
  createId?: () => string;
}>;

type TemplateRow = Readonly<{
  id: string;
  ledger_id: string;
  description: string;
  category_id: ExpenseCategoryId;
  amount_minor: number;
  due_day: number;
  start_month: string;
  end_month: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}>;

type BillRow = TemplateRow & Readonly<{
  occurrence_id: string;
  due_on: string;
  transaction_id: string | null;
}>;

type TransactionRow = Readonly<{
  id: string;
  kind: 'expense';
  amount_minor: number;
  category_id: ExpenseCategoryId;
  description: string;
  occurred_on: string;
  is_recurring: number;
  created_at: string;
  updated_at: string;
}>;

function readClock(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new DataBoundaryError();
  return new Date(value.getTime());
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const result = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isValidDateKey(result)) throw new DataBoundaryError();
  return result;
}

function mapTemplate(row: TemplateRow): RecurringTemplate {
  if (row.enabled !== 0 && row.enabled !== 1) throw new DataBoundaryError();
  if (!isValidIsoTimestamp(row.created_at) || !isValidIsoTimestamp(row.updated_at)) {
    throw new DataBoundaryError();
  }
  try {
    const draft = validateRecurringTemplateDraft({
      id: row.id,
      ledgerId: row.ledger_id,
      description: row.description,
      categoryId: row.category_id,
      amountMinor: row.amount_minor,
      dueDay: row.due_day,
      startMonth: row.start_month,
      endMonth: row.end_month,
      enabled: row.enabled === 1,
    });
    return { ...draft, createdAt: row.created_at, updatedAt: row.updated_at };
  } catch {
    throw new DataBoundaryError();
  }
}

function mapTransaction(row: TransactionRow): Transaction {
  if (row.kind !== 'expense' || row.is_recurring !== 1) throw new DataBoundaryError();
  try {
    return validateTransaction({
      id: row.id,
      kind: 'expense',
      amountMinor: row.amount_minor,
      categoryId: row.category_id,
      description: row.description,
      occurredOn: row.occurred_on,
      isRecurring: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch {
    throw new DataBoundaryError();
  }
}

function validateRange(start: string, end: string): void {
  if (!isValidDateKey(start) || !isValidDateKey(end) || end < start) throw new DataBoundaryError();
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime - startTime > 370 * 86_400_000) {
    throw new DataBoundaryError();
  }
}

export interface RecurringRepository {
  getTemplate(templateId: string): Promise<RecurringTemplate | null>;
  upsertTemplate(draft: RecurringTemplateDraft): Promise<RecurringTemplate>;
  archiveTemplate(templateId: string): Promise<void>;
  materializeExpectedOccurrences(today: string): Promise<void>;
  listExpectedBills(start: string, end: string, today: string): Promise<readonly ExpectedBill[]>;
  recordExpectedBill(
    occurrenceId: string,
    input: Readonly<{ transactionId: string; occurredOn: string }>,
  ): Promise<Transaction>;
}

export class SQLiteRecurringRepository implements RecurringRepository {
  private readonly clock: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly database: MigrationDatabase,
    private readonly ledgerId: string,
    options: Options = {},
  ) {
    if (!isCanonicalUuid(ledgerId)) throw new DataBoundaryError();
    this.clock = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => Crypto.randomUUID());
  }

  async getTemplate(templateId: string): Promise<RecurringTemplate | null> {
    if (!isCanonicalUuid(templateId)) throw new DataBoundaryError();
    return this.serialized(async () => {
      const row = await this.database.first<TemplateRow>(
        `SELECT id, ledger_id, description, category_id, amount_minor, due_day,
                start_month, end_month, enabled, created_at, updated_at
         FROM recurring_templates WHERE id = ? AND ledger_id = ?`,
        [templateId, this.ledgerId],
      );
      return row ? mapTemplate(row) : null;
    });
  }

  async upsertTemplate(draft: RecurringTemplateDraft): Promise<RecurringTemplate> {
    const valid = validateRecurringTemplateDraft(draft);
    if (valid.ledgerId !== this.ledgerId) throw new DataBoundaryError();
    return this.serialized(() => this.database.exclusive(async (database) => {
      const existing = await database.first<TemplateRow>(
        'SELECT * FROM recurring_templates WHERE id = ?',
        [valid.id],
      );
      if (existing && existing.ledger_id !== this.ledgerId) throw new DataBoundaryError();
      const clock = readClock(this.clock);
      const now = clock.toISOString();
      const createdAt = existing?.created_at ?? now;
      await database.run(
        `INSERT INTO recurring_templates(
          id, ledger_id, description, category_id, amount_minor, due_day,
          start_month, end_month, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          description = excluded.description,
          category_id = excluded.category_id,
          amount_minor = excluded.amount_minor,
          due_day = excluded.due_day,
          start_month = excluded.start_month,
          end_month = excluded.end_month,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
        WHERE recurring_templates.ledger_id = excluded.ledger_id`,
        [
          valid.id,
          valid.ledgerId,
          valid.description,
          valid.categoryId,
          valid.amountMinor,
          valid.dueDay,
          valid.startMonth,
          valid.endMonth,
          valid.enabled ? 1 : 0,
          createdAt,
          now,
        ],
      );
      const template = { ...valid, createdAt, updatedAt: now };
      if (existing) await this.reconcileTemplate(database, template, localDateKey(clock));
      return template;
    }));
  }

  async archiveTemplate(templateId: string): Promise<void> {
    if (!isCanonicalUuid(templateId)) throw new DataBoundaryError();
    await this.serialized(() => this.database.exclusive(async (database) => {
      const existing = await database.first<{ id: string }>(
        'SELECT id FROM recurring_templates WHERE id = ? AND ledger_id = ?',
        [templateId, this.ledgerId],
      );
      if (!existing) throw new Error('Recurring template not found.');
      await database.run(
        'UPDATE recurring_templates SET enabled = 0, updated_at = ? WHERE id = ? AND ledger_id = ?',
        [readClock(this.clock).toISOString(), templateId, this.ledgerId],
      );
      await database.run(
        'DELETE FROM expected_occurrences WHERE template_id = ? AND transaction_id IS NULL',
        [templateId],
      );
    }));
  }

  async materializeExpectedOccurrences(today: string): Promise<void> {
    enumerateMaterializationMonths(today);
    await this.serialized(() => this.database.exclusive(async (database) => {
      const rows = await database.all<TemplateRow>(
        'SELECT * FROM recurring_templates WHERE ledger_id = ? ORDER BY id LIMIT 1001',
        [this.ledgerId],
      );
      if (rows.length > 1000) throw new DataBoundaryError();
      for (const row of rows) {
        await this.reconcileTemplate(database, mapTemplate(row), today);
      }
    }));
  }

  async listExpectedBills(
    start: string,
    end: string,
    today: string,
  ): Promise<readonly ExpectedBill[]> {
    validateRange(start, end);
    if (!isValidDateKey(today)) throw new DataBoundaryError();
    return this.serialized(async () => {
      const rows = await this.database.all<BillRow>(
        `SELECT
          o.id AS occurrence_id, o.due_on, o.transaction_id,
          t.id, t.ledger_id, t.description, t.category_id, t.amount_minor,
          t.due_day, t.start_month, t.end_month, t.enabled, t.created_at, t.updated_at
        FROM expected_occurrences AS o
        JOIN recurring_templates AS t ON t.id = o.template_id
        WHERE t.ledger_id = ? AND o.due_on BETWEEN ? AND ?
          AND (t.enabled = 1 OR o.transaction_id IS NOT NULL)
        ORDER BY o.due_on, o.id LIMIT 1001`,
        [this.ledgerId, start, end],
      );
      if (rows.length > 1000) throw new DataBoundaryError();
      return rows.map((row) => ({
        id: row.occurrence_id,
        templateId: row.id,
        dueOn: row.due_on,
        transactionId: row.transaction_id,
        status: occurrenceStatus(row.due_on, row.transaction_id, today),
        template: mapTemplate(row),
      }));
    });
  }

  async recordExpectedBill(
    occurrenceId: string,
    input: Readonly<{ transactionId: string; occurredOn: string }>,
  ): Promise<Transaction> {
    if (!isCanonicalUuid(occurrenceId) || !isUuidV4(input.transactionId) || !isValidDateKey(input.occurredOn)) {
      throw new DataBoundaryError();
    }
    return this.serialized(() => this.database.exclusive(async (database) => {
      const bill = await database.first<BillRow>(
        `SELECT
          o.id AS occurrence_id, o.due_on, o.transaction_id,
          t.id, t.ledger_id, t.description, t.category_id, t.amount_minor,
          t.due_day, t.start_month, t.end_month, t.enabled, t.created_at, t.updated_at
        FROM expected_occurrences AS o
        JOIN recurring_templates AS t ON t.id = o.template_id
        WHERE o.id = ? AND t.ledger_id = ?`,
        [occurrenceId, this.ledgerId],
      );
      if (!bill) throw new Error('Expected bill not found.');
      if (bill.transaction_id !== null) {
        if (bill.transaction_id !== input.transactionId) {
          throw new Error('This expected bill is already linked to a different transaction.');
        }
        const existing = await this.readTransaction(database, input.transactionId);
        if (!existing || existing.occurredOn !== input.occurredOn) {
          throw new Error('This expected bill replay does not match its recorded transaction.');
        }
        return existing;
      }
      const count = await database.first<{ count: number }>(
        `SELECT count(*) AS count FROM (
          SELECT 1 FROM transactions WHERE ledger_id = ? LIMIT ?
        )`,
        [this.ledgerId, MAX_LEDGER_TRANSACTIONS + 1],
      );
      if (!count || !Number.isSafeInteger(count.count) || count.count < 0) throw new DataBoundaryError();
      if (count.count >= MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
      const template = mapTemplate(bill);
      const now = readClock(this.clock).toISOString();
      const transaction = validateTransaction({
        id: input.transactionId,
        kind: 'expense',
        amountMinor: template.amountMinor,
        categoryId: template.categoryId,
        description: template.description,
        occurredOn: input.occurredOn,
        isRecurring: true,
        createdAt: now,
        updatedAt: now,
      });
      await database.run(
        `INSERT INTO transactions(
          id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
          legacy_recurring, source_template_id, source_due_on, created_at, updated_at
        ) VALUES (?, ?, 'expense', ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          transaction.id,
          this.ledgerId,
          transaction.amountMinor,
          transaction.categoryId,
          transaction.description,
          transaction.occurredOn,
          template.id,
          bill.due_on,
          now,
          now,
        ],
      );
      await database.run(
        `UPDATE expected_occurrences SET transaction_id = ?, updated_at = ?
         WHERE id = ? AND template_id = ? AND transaction_id IS NULL`,
        [transaction.id, now, occurrenceId, template.id],
      );
      return transaction;
    }));
  }

  private async readTransaction(database: MigrationDatabase, id: string): Promise<Transaction | null> {
    const row = await database.first<TransactionRow>(
      `SELECT id, kind, amount_minor, category_id, description, occurred_on,
              legacy_recurring AS is_recurring, created_at, updated_at
       FROM transactions WHERE id = ? AND ledger_id = ?`,
      [id, this.ledgerId],
    );
    return row ? mapTransaction(row) : null;
  }

  private async reconcileTemplate(
    database: MigrationDatabase,
    template: RecurringTemplate,
    today: string,
  ): Promise<void> {
    const months = enumerateMaterializationMonths(today);
    const windowStart = `${months[0]}-01`;
    const windowEnd = resolveMonthlyDueDate(months[months.length - 1], 31);
    const expected = new Set<string>();
    if (template.enabled) {
      for (const month of months) {
        if (month < template.startMonth || (template.endMonth !== null && month > template.endMonth)) continue;
        expected.add(resolveMonthlyDueDate(month, template.dueDay));
      }
    }
    const occurrences = await database.all<{
      id: string;
      due_on: string;
      transaction_id: string | null;
    }>(
      `SELECT id, due_on, transaction_id FROM expected_occurrences
       WHERE template_id = ? AND due_on BETWEEN ? AND ?`,
      [template.id, windowStart, windowEnd],
    );
    const retainedDates = new Set<string>();
    for (const occurrence of occurrences) {
      if (!expected.has(occurrence.due_on) && occurrence.transaction_id === null) {
        await database.run(
          'DELETE FROM expected_occurrences WHERE id = ? AND template_id = ? AND transaction_id IS NULL',
          [occurrence.id, template.id],
        );
      } else {
        retainedDates.add(occurrence.due_on);
      }
    }
    const now = readClock(this.clock).toISOString();
    for (const dueOn of expected) {
      if (retainedDates.has(dueOn)) continue;
      const occurrenceId = this.createId();
      if (!isUuidV4(occurrenceId)) throw new DataBoundaryError();
      await database.run(
        `INSERT INTO expected_occurrences(
          id, template_id, due_on, transaction_id, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?)
        ON CONFLICT(template_id, due_on) DO NOTHING`,
        [occurrenceId, template.id, dueOn, now, now],
      );
    }
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    return serializeDatabaseAccess(this.database.identity, work);
  }
}
