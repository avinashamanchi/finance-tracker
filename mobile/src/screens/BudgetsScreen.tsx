import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BudgetRow } from '../components/BudgetRow';
import { Screen } from '../components/Screen';
import { useFinance } from '../data/FinanceProvider';
import { EXPENSE_CATEGORIES } from '../domain/categories';
import { formatMinor } from '../domain/money';
import { currentMonth } from '../domain/summaries';
import { colors, radius, spacing } from '../design/tokens';
import type { PlanningRepository } from '../data/planningRepository';
import type { RolloverPolicy } from '../domain/planning';

export function BudgetsScreen({
  initialMonth,
  isPlus = false,
  onUpgrade = () => {},
  planningRepository,
}: { initialMonth?: string; isPlus?: boolean; onUpgrade?: () => void; planningRepository?: PlanningRepository | null }) {
  const finance = useFinance();
  const month = initialMonth ?? currentMonth();
  const view = finance.monthViews[month];
  const { loadMonthView } = finance;
  const [rollover, setRollover] = useState<Record<string, RolloverPolicy>>({});
  const [rolloverError, setRolloverError] = useState<string | null>(null);
  useEffect(() => { void loadMonthView(month); }, [loadMonthView, month]);
  useEffect(() => {
    if (!planningRepository) return;
    void planningRepository.listBudgetPlans(month).then((plans) => setRollover(Object.fromEntries(
      plans.map((plan) => [plan.categoryId, plan.rolloverPolicy]),
    ))).catch(() => undefined);
  }, [month, planningRepository]);
  if (!finance.ledger || (!view && !finance.monthErrors[month])) {
    return <Screen><ActivityIndicator accessibilityLabel="Loading monthly budgets" color={colors.jade} /></Screen>;
  }
  if (!view) {
    return <Screen><Text accessibilityRole="alert" style={styles.noteText}>{finance.monthErrors[month] ?? 'Finova could not load these budgets.'}</Text></Screen>;
  }
  const ledger = finance.ledger;
  const { budgetUsage } = view;
  const overCount = budgetUsage.budgets.filter((budget) => (
    (budgetUsage.expenseByCategory[budget.categoryId] ?? 0) > budget.limitMinor
  )).length;
  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>MONTHLY GUARDRAILS</Text><Text style={styles.title}>Budgets</Text><Text style={styles.subtitle}>Limits repeat each month. Finova only reports what you record.</Text></View>
      <View style={styles.overview}>
        <View><Text style={styles.overviewLabel}>TOTAL LIMITS</Text><Text style={styles.overviewValue}>{formatMinor(budgetUsage.totalLimitMinor, ledger)}</Text></View>
        <View style={styles.divider} />
        <View><Text style={styles.overviewLabel}>OVER LIMIT</Text><Text style={[styles.overviewValue, overCount > 0 && styles.over]}>{overCount}</Text></View>
      </View>
      <View style={styles.note}><Text style={styles.noteText}>Budgets are informational. They do not block purchases or connect to a bank.</Text></View>
      {rolloverError ? <Text accessibilityRole="alert" style={styles.rolloverError}>{rolloverError}</Text> : null}
      <View style={styles.list}>
        {EXPENSE_CATEGORIES.map((category) => {
          const budget = budgetUsage.budgets.find((item) => item.categoryId === category.id);
          const rolloverPolicy = rollover[category.id] ?? 'none';
          return (
            <View key={category.id} style={styles.budgetCard}>
            <BudgetRow
              categoryId={category.id}
              color={category.color}
              key={`${category.id}:${budget?.limitMinor ?? 0}`}
              label={category.label}
              ledger={ledger}
              limitMinor={budget?.limitMinor ?? 0}
              onSave={async (limitMinor) => {
                const isNewActiveBudget = (budget?.limitMinor ?? 0) === 0 && limitMinor > 0;
                const activeBudgetCount = budgetUsage.budgets.filter(item => item.limitMinor > 0).length;
                if (!isPlus && isNewActiveBudget && activeBudgetCount >= 3) {
                  onUpgrade();
                  return;
                }
                if (planningRepository && limitMinor > 0) {
                  await planningRepository.setBudgetPlan({
                    ledgerId: ledger.id,
                    categoryId: category.id,
                    month,
                    limitMinor,
                    rolloverPolicy,
                  });
                  await finance.loadMonthView(month);
                } else {
                  await finance.setBudget(category.id, limitMinor, month);
                }
              }}
              spentMinor={budgetUsage.expenseByCategory[category.id] ?? 0}
            />
            <Pressable accessibilityLabel={`${category.label} rollover ${rolloverPolicy === 'carry_unused' ? 'on' : 'off'}`} accessibilityRole="button" onPress={() => {
              if (!isPlus) { onUpgrade(); return; }
              const next = rolloverPolicy === 'carry_unused' ? 'none' : 'carry_unused';
              setRolloverError(null);
              setRollover((current) => ({ ...current, [category.id]: next }));
              if (planningRepository && budget && budget.limitMinor > 0) {
                void planningRepository.setBudgetPlan({
                  ledgerId: ledger.id,
                  categoryId: category.id,
                  month,
                  limitMinor: budget.limitMinor,
                  rolloverPolicy: next,
                }).then(() => finance.loadMonthView(month)).catch(() => {
                  setRollover((current) => ({ ...current, [category.id]: rolloverPolicy }));
                  setRolloverError('The rollover choice could not be saved safely. Try again.');
                });
              }
            }} style={styles.rollover}><Text style={styles.rolloverText}>{rolloverPolicy === 'carry_unused' ? 'Carry unused amount: On' : 'Carry unused amount: Off'}{!isPlus ? ' · Plus' : ''}</Text></Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: spacing.sm },
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  overview: { alignItems: 'center', backgroundColor: colors.jadeDark, borderColor: '#286B5C', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', padding: spacing.lg },
  overviewLabel: { color: '#ABD8CB', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  overviewValue: { color: colors.text, fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 5 },
  divider: { backgroundColor: '#286B5C', height: 48, width: 1 }, over: { color: colors.coral },
  note: { backgroundColor: colors.inkRaised, borderRadius: radius.sm, padding: spacing.sm }, noteText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  list: { gap: spacing.sm }, budgetCard: { gap: 4 }, rollover: { alignSelf: 'flex-end', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: 10 }, rolloverText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' }, rolloverError: { color: colors.coral, fontSize: 12, lineHeight: 18 },
});
