import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EntitlementStatus } from '../access/entitlements';
import { Screen } from '../components/Screen';
import type { PlanningRepository } from '../data/planningRepository';
import { formatMinor, minorToDecimal, parseMinorAmount } from '../domain/money';
import type { GoalProgress, SavingsGoal } from '../domain/planning';
import type { Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

function todayKey(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function SavingsGoalDetailScreen({ repository, ledger, goalId, entitlement, onDone, onUpgrade }: Readonly<{
  repository: PlanningRepository;
  ledger: Ledger;
  goalId: string;
  entitlement: EntitlementStatus;
  onDone(): void;
  onUpgrade(): void;
}>) {
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      const next = (await repository.listGoals(true)).find((item) => item.id === goalId) ?? null;
      if (!next) throw new Error('Savings goal not found.');
      setGoal(next);
      setProgress(await repository.getGoalProgress(goalId));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Savings goal could not be loaded.'); }
  }, [goalId, repository]);
  useEffect(() => { void reload(); }, [reload]);
  if (!goal || !progress) return <Screen>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : <ActivityIndicator accessibilityLabel="Loading savings goal" color={colors.jade} />}</Screen>;

  const add = async () => {
    if (entitlement !== 'active') { onUpgrade(); return; }
    const parsed = parseMinorAmount(amount, ledger.currencyMinorUnit);
    if (!parsed.ok) { setError(parsed.message); return; }
    setBusy(true); setError(null);
    try {
      await repository.addGoalContribution({ id: Crypto.randomUUID(), goalId, amountMinor: parsed.minor, occurredOn: date, note: note.trim() });
      setAmount(''); setNote(''); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Contribution could not be recorded.'); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    setBusy(true); setError(null);
    try { await repository.archiveGoal(goalId); onDone(); }
    catch { setError('Savings goal could not be archived.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Text style={styles.eyebrow}>NO MONEY IS MOVED</Text><Text accessibilityRole="header" style={styles.title}>{goal.name}</Text><Text style={styles.subtitle}>{formatMinor(progress.recordedMinor, ledger)} recorded of {formatMinor(goal.targetMinor, ledger)} · {progress.percent.toFixed(1)}%</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, progress.percent)}%` }]} /></View>
      <Text style={styles.label}>Contribution record ({ledger.currencyCode})</Text><TextInput accessibilityLabel="Savings contribution amount" keyboardType="decimal-pad" onChangeText={setAmount} placeholder={minorToDecimal(0, ledger.currencyMinorUnit)} placeholderTextColor={colors.textMuted} style={styles.input} value={amount} />
      <Text style={styles.label}>Date</Text><TextInput accessibilityLabel="Savings contribution date" maxLength={10} onChangeText={setDate} style={styles.input} value={date} />
      <Text style={styles.label}>Note (optional)</Text><TextInput accessibilityLabel="Savings contribution note" maxLength={120} onChangeText={setNote} placeholder="Manual transfer" placeholderTextColor={colors.textMuted} style={styles.input} value={note} />
      {entitlement !== 'active' ? <Text style={styles.notice}>Existing progress is visible. A verified Plus entitlement is required to add another contribution.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityLabel="Record savings contribution" accessibilityRole="button" disabled={busy} onPress={() => void add()} style={styles.primary}><Text style={styles.primaryText}>{entitlement === 'active' ? 'Record contribution' : 'View Finova Plus'}</Text></Pressable>
      <Pressable accessibilityLabel="Archive savings goal" accessibilityRole="button" disabled={busy} onPress={() => void archive()} style={styles.archive}><Text style={styles.archiveText}>Archive goal</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: spacing.sm }, title: { color: colors.text, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, label: { color: colors.text, fontSize: 13, fontWeight: '800' }, input: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.md }, track: { backgroundColor: colors.inkRaised, borderRadius: radius.pill, height: 10, overflow: 'hidden' }, fill: { backgroundColor: colors.jade, height: 10 }, notice: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, error: { color: colors.coral, fontSize: 13 }, primary: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, justifyContent: 'center', minHeight: 54 }, primaryText: { color: colors.ink, fontWeight: '900' }, archive: { alignItems: 'center', borderColor: colors.coral, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 50 }, archiveText: { color: colors.coral, fontWeight: '900' },
});
