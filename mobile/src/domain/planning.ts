import { isExpenseCategory, type ExpenseCategoryId } from './categories';
import { hasUnpairedSurrogate, isCanonicalUuid, isValidDateKey } from '../data/validation';
import { validateMonth } from './recurrence';

export type RolloverPolicy = 'none' | 'carry_unused';

export type BudgetPlanDraft = Readonly<{
  ledgerId: string;
  categoryId: ExpenseCategoryId;
  month: string;
  limitMinor: number;
  rolloverPolicy: RolloverPolicy;
}>;

export type BudgetPlan = BudgetPlanDraft & Readonly<{ updatedAt: string }>;

export type PlanningBudgetUsage = Readonly<{
  baseMinor: number;
  carryMinor: number;
  spentMinor: number;
  availableMinor: number;
  remainingMinor: number;
}>;

export type SavingsGoalDraft = Readonly<{
  id: string;
  ledgerId: string;
  name: string;
  targetMinor: number;
  targetOn: string | null;
}>;

export type SavingsGoal = SavingsGoalDraft & Readonly<{
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type GoalContributionDraft = Readonly<{
  id: string;
  goalId: string;
  amountMinor: number;
  occurredOn: string;
  note: string;
}>;

export type GoalContribution = GoalContributionDraft & Readonly<{ createdAt: string }>;

export type GoalProgress = Readonly<{
  recordedMinor: number;
  remainingMinor: number;
  percent: number;
}>;

function validateBoundedText(value: string, maximum: number, label: string): string {
  if (
    value.trim() !== value
    || Array.from(value).length < 1
    || Array.from(value).length > maximum
    || value.includes('\u0000')
    || hasUnpairedSurrogate(value)
  ) throw new Error(`${label} is invalid.`);
  return value;
}

export function validateBudgetPlanDraft(draft: BudgetPlanDraft): BudgetPlanDraft {
  if (!isCanonicalUuid(draft.ledgerId) || !isExpenseCategory(draft.categoryId)) {
    throw new Error('Budget plan identity is invalid.');
  }
  const month = validateMonth(draft.month);
  if (!Number.isSafeInteger(draft.limitMinor) || draft.limitMinor < 1) {
    throw new Error('Budget plan amount is invalid.');
  }
  if (draft.rolloverPolicy !== 'none' && draft.rolloverPolicy !== 'carry_unused') {
    throw new Error('Budget rollover policy is invalid.');
  }
  return { ...draft, month };
}

export function validateSavingsGoalDraft(draft: SavingsGoalDraft): SavingsGoalDraft {
  if (!isCanonicalUuid(draft.id) || !isCanonicalUuid(draft.ledgerId)) {
    throw new Error('Savings goal identity is invalid.');
  }
  const name = validateBoundedText(draft.name, 80, 'Savings goal name');
  if (!Number.isSafeInteger(draft.targetMinor) || draft.targetMinor < 1) {
    throw new Error('Savings goal amount is invalid.');
  }
  if (draft.targetOn !== null && !isValidDateKey(draft.targetOn)) {
    throw new Error('Savings goal date is invalid.');
  }
  return { ...draft, name };
}

export function validateGoalContributionDraft(draft: GoalContributionDraft): GoalContributionDraft {
  if (!isCanonicalUuid(draft.id) || !isCanonicalUuid(draft.goalId)) {
    throw new Error('Goal contribution identity is invalid.');
  }
  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor < 1) {
    throw new Error('Goal contribution amount is invalid.');
  }
  if (!isValidDateKey(draft.occurredOn)) throw new Error('Goal contribution date is invalid.');
  if (
    draft.note.trim() !== draft.note
    || Array.from(draft.note).length > 120
    || draft.note.includes('\u0000')
    || hasUnpairedSurrogate(draft.note)
  ) throw new Error('Goal contribution note is invalid.');
  return { ...draft };
}
