import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntitlementStatus } from '../access/entitlements';
import { Screen } from '../components/Screen';
import type { PlanningRepository } from '../data/planningRepository';
import { formatMinor } from '../domain/money';
import type { GoalProgress, SavingsGoal } from '../domain/planning';
import type { Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

export function SavingsGoalsScreen({
  repository,
  ledger,
  entitlement,
  onNew,
  onOpen,
  onUpgrade,
}: Readonly<{
  repository: PlanningRepository;
  ledger: Ledger;
  entitlement: EntitlementStatus;
  onNew(): void;
  onOpen(goal: SavingsGoal): void;
  onUpgrade(): void;
}>) {
  const [goals, setGoals] = useState<readonly SavingsGoal[]>([]);
  const [progress, setProgress] = useState<Readonly<Record<string, GoalProgress>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await repository.listGoals(false);
      const entries = await Promise.all(next.map(async (goal) => (
        [goal.id, await repository.getGoalProgress(goal.id)] as const
      )));
      setGoals(next);
      setProgress(Object.fromEntries(entries));
    } catch {
      setError('Savings goals could not be loaded safely.');
    } finally {
      setLoading(false);
    }
  }, [repository]);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>TRACKING, NOT TRANSFERS</Text><Text accessibilityRole="header" style={styles.title}>Savings goals</Text><Text style={styles.subtitle}>Contributions are planning records only. Finova never moves or reserves money.</Text></View>
      <Pressable accessibilityLabel={entitlement === 'active' ? 'Create savings goal' : 'Unlock savings goals'} accessibilityRole="button" onPress={entitlement === 'active' ? onNew : onUpgrade} style={styles.primary}><Text style={styles.primaryText}>{entitlement === 'active' ? 'Create savings goal' : 'Savings goals are in Plus'}</Text></Pressable>
      {entitlement === 'unknown' ? <Text style={styles.notice}>Purchase status is temporarily unavailable. Existing goals remain readable, while new goals and contributions stay locked.</Text> : null}
      {loading ? <ActivityIndicator accessibilityLabel="Loading savings goals" color={colors.jade} /> : null}
      {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void reload()}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
      {!loading && !error && goals.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No goals yet</Text><Text style={styles.subtitle}>Create a target and record progress without connecting a bank.</Text></View> : null}
      {goals.map((goal) => {
        const value = progress[goal.id];
        return (
          <Pressable accessibilityLabel={`Open ${goal.name} savings goal`} accessibilityRole="button" key={goal.id} onPress={() => onOpen(goal)} style={styles.card}>
            <View style={styles.cardTop}><Text style={styles.goalName}>{goal.name}</Text><Text style={styles.percent}>{value?.percent.toFixed(1) ?? '0.0'}%</Text></View>
            <Text style={styles.amount}>{formatMinor(value?.recordedMinor ?? 0, ledger)} of {formatMinor(goal.targetMinor, ledger)}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, value?.percent ?? 0)}%` }]} /></View>
            <Text style={styles.meta}>{goal.targetOn ? `Target ${goal.targetOn}` : 'No target date'} · {formatMinor(value?.remainingMinor ?? goal.targetMinor, ledger)} remaining</Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 5, paddingTop: spacing.sm }, eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 29, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  primary: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, justifyContent: 'center', minHeight: 52 }, primaryText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  notice: { backgroundColor: colors.inkRaised, borderRadius: radius.sm, color: colors.textMuted, fontSize: 12, lineHeight: 18, padding: spacing.md },
  error: { backgroundColor: '#3B2327', borderColor: colors.coral, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md }, errorText: { color: colors.text }, retry: { color: colors.coral, fontWeight: '900' },
  empty: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.lg }, emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, minHeight: 130, padding: spacing.md }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, goalName: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '900' }, percent: { color: colors.jade, fontSize: 14, fontWeight: '900' }, amount: { color: colors.text, fontSize: 14, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11 },
  track: { backgroundColor: colors.inkRaised, borderRadius: radius.pill, height: 8, overflow: 'hidden' }, fill: { backgroundColor: colors.jade, borderRadius: radius.pill, height: 8 },
});
