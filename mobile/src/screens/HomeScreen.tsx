import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';
import { useFinance } from '../data/FinanceProvider';
import { getCategory } from '../domain/categories';
import { formatMinor } from '../domain/money';
import { currentMonth, shiftMonth } from '../domain/summaries';
import { colors, radius, spacing } from '../design/tokens';

function monthTitle(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function HomeScreen({ initialMonth, onAdd, onInsights, onExpectedBills = () => {}, onSavingsGoals = () => {} }: {
  initialMonth?: string; onAdd: () => void; onInsights: () => void; onExpectedBills?: () => void; onSavingsGoals?: () => void;
}) {
  const finance = useFinance();
  const [month, setMonth] = useState(initialMonth ?? currentMonth());
  const view = finance.monthViews[month];
  const trend = finance.trendViews[month] ?? [];
  const { loadMonthView, loadTrendView } = finance;

  useEffect(() => {
    void loadMonthView(month);
    void loadTrendView(month);
  }, [loadMonthView, loadTrendView, month]);

  if (!finance.ledger || (!view && !finance.monthErrors[month])) {
    return <Screen><ActivityIndicator accessibilityLabel="Loading local finance data" color={colors.jade} /></Screen>;
  }
  if (!view) {
    return <Screen><View style={styles.errorCard}><Text style={styles.errorText}>{finance.monthErrors[month] ?? finance.error ?? 'Finova could not load this month.'}</Text><Pressable accessibilityRole="button" onPress={() => void finance.loadMonthView(month)}><Text style={styles.retry}>Try again</Text></Pressable></View></Screen>;
  }

  const { summary, budgetUsage, recentTransactions } = view;
  const budgetWarnings = budgetUsage.budgets
    .map((budget) => ({
      ...budget,
      spent: summary.expenseByCategory[budget.categoryId] ?? 0,
      percent: Math.round(((summary.expenseByCategory[budget.categoryId] ?? 0) / budget.limitMinor) * 100),
    }))
    .filter((budget) => budget.percent >= 80)
    .sort((left, right) => right.percent - left.percent);

  return (
    <Screen>
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>LOCAL LEDGER</Text>
          <Text style={styles.title}>Your money, clearly.</Text>
          <Text style={styles.subtitle}>Private on this device until you choose to export.</Text>
        </View>
        <Pressable accessibilityLabel="Add transaction" accessibilityRole="button" onPress={onAdd} style={styles.add} testID="home-add">
          <Ionicons color={colors.ink} name="add" size={25} />
        </Pressable>
      </View>

      <View style={styles.monthPicker}>
        <Pressable accessibilityLabel="Previous month" accessibilityRole="button" onPress={() => setMonth(shiftMonth(month, -1))} style={styles.monthButton}>
          <Ionicons color={colors.text} name="chevron-back" size={20} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.month}>{monthTitle(month)}</Text>
        <Pressable accessibilityLabel="Next month" accessibilityRole="button" onPress={() => setMonth(shiftMonth(month, 1))} style={styles.monthButton}>
          <Ionicons color={colors.text} name="chevron-forward" size={20} />
        </Pressable>
      </View>

      {finance.monthErrors[month] || finance.error ? (
        <View style={styles.errorCard}><Text style={styles.errorText}>{finance.monthErrors[month] ?? finance.error}</Text><Pressable accessibilityRole="button" onPress={() => void finance.loadMonthView(month)}><Text style={styles.retry}>Try again</Text></Pressable></View>
      ) : null}

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>MONTHLY BALANCE</Text>
        <Text style={[styles.balance, summary.balanceMinor < 0 && styles.negative]}>{formatMinor(summary.balanceMinor, finance.ledger)}</Text>
        <Text style={styles.balanceDetail}>{summary.transactionCount} transaction{summary.transactionCount === 1 ? '' : 's'} · {summary.savingsRatePercent.toFixed(1)}% savings rate</Text>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Income" value={formatMinor(summary.incomeMinor, finance.ledger)} detail="Recorded this month" tone="positive" />
        <MetricCard label="Spent" value={formatMinor(summary.expenseMinor, finance.ledger)} detail="Recorded this month" tone="negative" />
      </View>

      {summary.transactionCount === 0 ? (
        <EmptyState title="Your month starts here" detail="Add income or an expense to build your private monthly view." actionLabel="Add first transaction" onAction={onAdd} />
      ) : (
        <>
          {budgetWarnings.length ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Budget watch</Text>
              {budgetWarnings.slice(0, 3).map((budget) => {
                const category = getCategory(budget.categoryId);
                const prefix = budget.percent > 100 ? 'Over limit' : 'Near limit';
                return <Text key={budget.categoryId} style={budget.percent > 100 ? styles.warningOver : styles.warning}>{category?.label} · {prefix} — {budget.percent}% used</Text>;
              })}
            </View>
          ) : null}

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent activity</Text></View>
          {recentTransactions.map((transaction) => <TransactionRow key={transaction.id} ledger={finance.ledger!} transaction={transaction} />)}
        </>
      )}

      <Pressable accessibilityLabel="Open six-month insights" accessibilityRole="button" onPress={onInsights} style={styles.insights}>
        <View><Text style={styles.insightsEyebrow}>SIX-MONTH SIGNAL</Text><Text style={styles.insightsTitle}>See the shape of your cash flow</Text><Text style={styles.insightsDetail}>{trend.filter((point) => point.incomeMinor || point.expenseMinor).length} months with recorded activity</Text></View>
        <Ionicons color={colors.jade} name="arrow-forward" size={22} />
      </Pressable>

      <View style={styles.planningGrid}>
        <Pressable accessibilityLabel="Open expected bills" accessibilityRole="button" onPress={onExpectedBills} style={styles.planningCard}><Ionicons color={colors.jade} name="calendar-outline" size={23} /><Text style={styles.planningTitle}>Expected bills</Text><Text style={styles.planningDetail}>Plan dates. Record only after review.</Text></Pressable>
        <Pressable accessibilityLabel="Open savings goals" accessibilityRole="button" onPress={onSavingsGoals} style={styles.planningCard}><Ionicons color={colors.jade} name="flag-outline" size={23} /><Text style={styles.planningTitle}>Savings goals</Text><Text style={styles.planningDetail}>Track progress. No money is moved.</Text></Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 5, maxWidth: 280 },
  add: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: 16, height: 50, justifyContent: 'center', width: 50 },
  monthPicker: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.inkRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: 4 },
  monthButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  month: { color: colors.text, fontSize: 14, fontWeight: '800', minWidth: 140, textAlign: 'center' },
  balanceCard: { backgroundColor: colors.jadeDark, borderColor: '#286B5C', borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
  balanceLabel: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  balance: { color: colors.text, fontSize: 40, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -1.5 },
  negative: { color: colors.coral },
  balanceDetail: { color: '#ABD8CB', fontSize: 13 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionCard: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  warning: { color: colors.amber, fontSize: 13, fontWeight: '700' },
  warningOver: { color: colors.coral, fontSize: 13, fontWeight: '700' },
  insights: { alignItems: 'center', backgroundColor: colors.inkRaised, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, minHeight: 110, padding: spacing.lg },
  insightsEyebrow: { color: colors.jade, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  insightsTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5, maxWidth: 260 },
  insightsDetail: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
  planningGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, planningCard: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flex: 1, gap: spacing.xs, minHeight: 130, minWidth: 145, padding: spacing.md }, planningTitle: { color: colors.text, fontSize: 15, fontWeight: '900' }, planningDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  errorCard: { backgroundColor: '#3B2327', borderColor: colors.coral, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.text, fontSize: 14 },
  retry: { color: colors.coral, fontSize: 14, fontWeight: '800' },
});
