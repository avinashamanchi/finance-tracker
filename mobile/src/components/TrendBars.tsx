import { StyleSheet, Text, View } from 'react-native';
import { formatCents } from '../domain/money';
import type { MonthlyPoint } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-US', { month: 'short' });
}

export function TrendBars({ points }: { points: readonly MonthlyPoint[] }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.incomeCents, point.expenseCents]));
  return (
    <View style={styles.chart}>
      {points.map((point) => (
        <View
          accessible
          accessibilityLabel={`${point.month}. Income ${formatCents(point.incomeCents)}, expenses ${formatCents(point.expenseCents)}, balance ${formatCents(point.balanceCents)}`}
          key={point.month}
          style={styles.column}
        >
          <View style={styles.bars}>
            <View style={[styles.bar, styles.income, { height: Math.max(3, (point.incomeCents / max) * 100) }]} />
            <View style={[styles.bar, styles.expense, { height: Math.max(3, (point.expenseCents / max) * 100) }]} />
          </View>
          <Text style={styles.label}>{monthLabel(point.month)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm, height: 140, justifyContent: 'space-between' },
  column: { alignItems: 'center', flex: 1, gap: spacing.xs },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 104 },
  bar: { borderRadius: radius.sm, minHeight: 3, width: 7 },
  income: { backgroundColor: colors.jade },
  expense: { backgroundColor: colors.coral },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
});
