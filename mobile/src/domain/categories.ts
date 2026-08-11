export const INCOME_CATEGORIES = [
  { id: 'salary', label: 'Salary', icon: 'briefcase', color: '#39D9B0' },
  { id: 'freelance', label: 'Freelance', icon: 'laptop-outline', color: '#66A3FF' },
  { id: 'business', label: 'Business', icon: 'business-outline', color: '#A78BFA' },
  { id: 'investment', label: 'Investment income', icon: 'trending-up', color: '#F4C95D' },
  { id: 'gift', label: 'Gift or bonus', icon: 'gift-outline', color: '#F08BB4' },
  { id: 'other_income', label: 'Other income', icon: 'add-circle-outline', color: '#9AA8B5' },
] as const;

export const EXPENSE_CATEGORIES = [
  { id: 'housing', label: 'Housing', icon: 'home-outline', color: '#F4C95D' },
  { id: 'utilities', label: 'Utilities', icon: 'flash-outline', color: '#66A3FF' },
  { id: 'groceries', label: 'Groceries', icon: 'basket-outline', color: '#39D9B0' },
  { id: 'dining', label: 'Dining', icon: 'restaurant-outline', color: '#F59E66' },
  { id: 'transport', label: 'Transport', icon: 'car-outline', color: '#7AB8FF' },
  { id: 'health', label: 'Health', icon: 'medkit-outline', color: '#6FE0B8' },
  { id: 'insurance', label: 'Insurance', icon: 'shield-checkmark-outline', color: '#B59AF7' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'phone-portrait-outline', color: '#F08BB4' },
  { id: 'shopping', label: 'Shopping', icon: 'bag-handle-outline', color: '#ED90C2' },
  { id: 'entertainment', label: 'Entertainment', icon: 'film-outline', color: '#9E87F5' },
  { id: 'education', label: 'Education', icon: 'school-outline', color: '#52C7D9' },
  { id: 'savings', label: 'Savings', icon: 'wallet-outline', color: '#42C991' },
  { id: 'personal', label: 'Personal care', icon: 'sparkles-outline', color: '#F58DA4' },
  { id: 'family', label: 'Family', icon: 'people-outline', color: '#F0C45B' },
  { id: 'pets', label: 'Pets', icon: 'paw-outline', color: '#A8D667' },
  { id: 'travel', label: 'Travel', icon: 'airplane-outline', color: '#68BFE6' },
  { id: 'giving', label: 'Gifts and giving', icon: 'heart-outline', color: '#EF7182' },
  { id: 'other_expense', label: 'Other expense', icon: 'ellipsis-horizontal-circle-outline', color: '#9AA8B5' },
] as const;

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as const;

export type IncomeCategoryId = (typeof INCOME_CATEGORIES)[number]['id'];
export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]['id'];
export type CategoryId = IncomeCategoryId | ExpenseCategoryId;

const incomeIds = new Set<string>(INCOME_CATEGORIES.map((category) => category.id));
const expenseIds = new Set<string>(EXPENSE_CATEGORIES.map((category) => category.id));

export function isIncomeCategory(value: string): value is IncomeCategoryId {
  return incomeIds.has(value);
}

export function isExpenseCategory(value: string): value is ExpenseCategoryId {
  return expenseIds.has(value);
}

export function isCategoryForKind(value: string, kind: 'income' | 'expense'): value is CategoryId {
  return kind === 'income' ? isIncomeCategory(value) : isExpenseCategory(value);
}

export function getCategory(id: string) {
  return ALL_CATEGORIES.find((category) => category.id === id);
}
