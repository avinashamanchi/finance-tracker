import { StyleSheet, Text, View } from 'react-native';
import { MetricCard } from '../components/MetricCard';
import { Screen } from '../components/Screen';
import { TrendBars } from '../components/TrendBars';
import { useFinance } from '../data/FinanceProvider';
import { formatCents } from '../domain/money';
import { buildSixMonthTrend, currentMonth } from '../domain/summaries';
import { colors, radius, spacing } from '../design/tokens';

export function InsightsScreen({ anchorMonth }: { anchorMonth?: string }) {
  const finance = useFinance();
  const points = buildSixMonthTrend(finance.transactions, anchorMonth ?? currentMonth());
  const income = points.reduce((total, point) => total + point.incomeCents, 0);
  const expenses = points.reduce((total, point) => total + point.expenseCents, 0);
  const activeMonths = points.filter((point) => point.incomeCents || point.expenseCents).length;
  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>RECORDED ACTIVITY</Text><Text style={styles.title}>Six-month view</Text><Text style={styles.subtitle}>A deterministic summary of entries in this app—not a forecast or financial recommendation.</Text></View>
      <View style={styles.metrics}>
        <MetricCard label="Income" value={formatCents(income)} detail="Across six months" tone="positive" />
        <MetricCard label="Expenses" value={formatCents(expenses)} detail="Across six months" tone="negative" />
      </View>
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}><Text style={styles.sectionTitle}>Income vs. expenses</Text><View style={styles.legend}><Text style={styles.incomeLegend}>● Income</Text><Text style={styles.expenseLegend}>● Expenses</Text></View></View>
        <TrendBars points={points} />
      </View>
      <View style={styles.note}><Text style={styles.noteTitle}>{activeMonths} of 6 months have data</Text><Text style={styles.noteText}>Missing or incorrect entries change every total shown here. Review your ledger before relying on a summary.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: spacing.sm }, eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chartCard: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.lg, padding: spacing.md },
  chartHeader: { gap: spacing.sm }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' }, legend: { flexDirection: 'row', gap: spacing.md },
  incomeLegend: { color: colors.jade, fontSize: 12, fontWeight: '700' }, expenseLegend: { color: colors.coral, fontSize: 12, fontWeight: '700' },
  note: { backgroundColor: colors.inkRaised, borderRadius: radius.md, gap: spacing.xs, padding: spacing.md }, noteTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, noteText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
