import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';
import { useFinance } from '../data/FinanceProvider';
import { getCategory } from '../domain/categories';
import { formatCents } from '../domain/money';
import { buildSixMonthTrend, currentMonth, shiftMonth, summarizeMonth } from '../domain/summaries';
import { colors, radius, spacing } from '../design/tokens';

function monthTitle(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function HomeScreen({ initialMonth, onAdd, onInsights }: {
  initialMonth?: string; onAdd: () => void; onInsights: () => void;
}) {
  const finance = useFinance();
  const [month, setMonth] = useState(initialMonth ?? currentMonth());
  const summary = useMemo(() => summarizeMonth(finance.transactions, month), [finance.transactions, month]);
  const trend = useMemo(() => buildSixMonthTrend(finance.transactions, month), [finance.transactions, month]);
  const monthTransactions = finance.transactions.filter((item) => item.occurredOn.startsWith(`${month}-`));
  const budgetWarnings = finance.budgets
    .map((budget) => ({
      ...budget,
      spent: summary.expenseByCategory[budget.categoryId] ?? 0,
      percent: Math.round(((summary.expenseByCategory[budget.categoryId] ?? 0) / budget.limitCents) * 100),
    }))
    .filter((budget) => budget.percent >= 80)
    .sort((left, right) => right.percent - left.percent);

  if (finance.loading) return <Screen><ActivityIndicator accessibilityLabel="Loading local finance data" color={colors.jade} /></Screen>;

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

      {finance.error ? (
        <View style={styles.errorCard}><Text style={styles.errorText}>{finance.error}</Text><Pressable accessibilityRole="button" onPress={() => void finance.reload()}><Text style={styles.retry}>Try again</Text></Pressable></View>
      ) : null}

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>MONTHLY BALANCE</Text>
        <Text style={[styles.balance, summary.balanceCents < 0 && styles.negative]}>{formatCents(summary.balanceCents)}</Text>
        <Text style={styles.balanceDetail}>{summary.transactionCount} transaction{summary.transactionCount === 1 ? '' : 's'} · {summary.savingsRatePercent.toFixed(1)}% savings rate</Text>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Income" value={formatCents(summary.incomeCents)} detail="Recorded this month" tone="positive" />
        <MetricCard label="Spent" value={formatCents(summary.expenseCents)} detail="Recorded this month" tone="negative" />
      </View>

      {monthTransactions.length === 0 ? (
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
          {monthTransactions.slice(0, 4).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
        </>
      )}

      <Pressable accessibilityLabel="Open six-month insights" accessibilityRole="button" onPress={onInsights} style={styles.insights}>
        <View><Text style={styles.insightsEyebrow}>SIX-MONTH SIGNAL</Text><Text style={styles.insightsTitle}>See the shape of your cash flow</Text><Text style={styles.insightsDetail}>{trend.filter((point) => point.incomeCents || point.expenseCents).length} months with recorded activity</Text></View>
        <Ionicons color={colors.jade} name="arrow-forward" size={22} />
      </Pressable>
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
  errorCard: { backgroundColor: '#3B2327', borderColor: colors.coral, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.text, fontSize: 14 },
  retry: { color: colors.coral, fontSize: 14, fontWeight: '800' },
});
