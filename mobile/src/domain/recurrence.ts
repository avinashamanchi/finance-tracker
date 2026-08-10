import { isExpenseCategory, type ExpenseCategoryId } from './categories';
import { isCanonicalUuid, isValidDateKey, hasUnpairedSurrogate } from '../data/validation';

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export type RecurringTemplateDraft = Readonly<{
  id: string;
  ledgerId: string;
  description: string;
  categoryId: ExpenseCategoryId;
  amountMinor: number;
  dueDay: number;
  startMonth: string;
  endMonth: string | null;
  enabled: boolean;
}>;

export type RecurringTemplate = RecurringTemplateDraft & Readonly<{
  createdAt: string;
  updatedAt: string;
}>;

export type ExpectedBillStatus = 'upcoming' | 'due' | 'overdue' | 'recorded';

export type ExpectedBill = Readonly<{
  id: string;
  templateId: string;
  dueOn: string;
  transactionId: string | null;
  status: ExpectedBillStatus;
  template: RecurringTemplate;
}>;

function parseMonth(month: string): Readonly<{ year: number; month: number }> {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new Error('A canonical local month is required.');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12) {
    throw new Error('A canonical local month is required.');
  }
  return { year, month: monthNumber };
}

export function validateMonth(month: string): string {
  parseMonth(month);
  return month;
}

export function shiftCanonicalMonth(month: string, offset: number): string {
  const parsed = parseMonth(month);
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 1200) {
    throw new Error('Month offset is outside the supported range.');
  }
  const absolute = (parsed.year - 1) * 12 + (parsed.month - 1) + offset;
  if (absolute < 0 || absolute >= 9999 * 12) throw new Error('Month is outside the supported range.');
  const year = Math.floor(absolute / 12) + 1;
  const monthNumber = absolute % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function resolveMonthlyDueDate(month: string, dueDay: number): string {
  const parsed = parseMonth(month);
  if (!Number.isSafeInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error('Recurring due day must be from 1 through 31.');
  }
  const day = Math.min(dueDay, daysInMonth(parsed.year, parsed.month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function enumerateMaterializationMonths(today: string): readonly string[] {
  if (!isValidDateKey(today) || today.slice(0, 4) === '0000') {
    throw new Error('A canonical local date is required.');
  }
  const current = today.slice(0, 7);
  return [-1, 0, 1, 2].map((offset) => shiftCanonicalMonth(current, offset));
}

function validateText(value: string, maximum: number, label: string): string {
  if (
    value.trim() !== value
    || Array.from(value).length < 1
    || Array.from(value).length > maximum
    || value.includes('\u0000')
    || hasUnpairedSurrogate(value)
  ) {
    throw new Error(`${label} must contain 1 to ${maximum} supported characters.`);
  }
  return value;
}

export function validateRecurringTemplateDraft(draft: RecurringTemplateDraft): RecurringTemplateDraft {
  if (!isCanonicalUuid(draft.id) || !isCanonicalUuid(draft.ledgerId)) {
    throw new Error('Canonical recurring identifiers are required.');
  }
  const description = validateText(draft.description, 120, 'Recurring description');
  if (!isExpenseCategory(draft.categoryId)) throw new Error('A recurring bill needs an expense category.');
  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor < 1) {
    throw new Error('Recurring amount is invalid.');
  }
  if (!Number.isSafeInteger(draft.dueDay) || draft.dueDay < 1 || draft.dueDay > 31) {
    throw new Error('Recurring due day must be from 1 through 31.');
  }
  const startMonth = validateMonth(draft.startMonth);
  const endMonth = draft.endMonth === null ? null : validateMonth(draft.endMonth);
  if (endMonth !== null && endMonth < startMonth) throw new Error('Recurring end month cannot precede its start month.');
  if (typeof draft.enabled !== 'boolean') throw new Error('Recurring enabled state is invalid.');
  return { ...draft, description, startMonth, endMonth };
}

export function occurrenceStatus(
  dueOn: string,
  transactionId: string | null,
  today: string,
): ExpectedBillStatus {
  if (!isValidDateKey(dueOn) || !isValidDateKey(today)) throw new Error('Expected bill date is invalid.');
  if (transactionId) return 'recorded';
  if (dueOn < today) return 'overdue';
  if (dueOn === today) return 'due';
  return 'upcoming';
}
