import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import type { RecurringRepository } from '../data/recurringRepository';
import { formatMinor } from '../domain/money';
import type { ExpectedBill } from '../domain/recurrence';
import type { Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

function localToday(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function ExpectedBillRecordScreen({ repository, ledger, occurrenceId, onRecorded, onCancel }: Readonly<{
  repository: RecurringRepository;
  ledger: Ledger;
  occurrenceId: string;
  onRecorded(): Promise<void> | void;
  onCancel(): void;
}>) {
  const [bill, setBill] = useState<ExpectedBill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const today = localToday();
    try {
      const match = (await repository.listExpectedBills(
        shiftDate(today, -185),
        shiftDate(today, 185),
        today,
      )).find((item) => item.id === occurrenceId) ?? null;
      if (!match) throw new Error('Expected bill not found.');
      setBill(match);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Expected bill could not be loaded.');
    }
  }, [occurrenceId, repository]);
  useEffect(() => { void load(); }, [load]);
  if (!bill) return <Screen>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : <ActivityIndicator accessibilityLabel="Loading expected bill" color={colors.jade} />}</Screen>;
  const record = async () => {
    setBusy(true); setError(null);
    try {
      await repository.recordExpectedBill(bill.id, {
        transactionId: Crypto.randomUUID(),
        occurredOn: bill.dueOn,
      });
      await onRecorded();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Expected bill could not be recorded.');
    } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Text style={styles.eyebrow}>FINAL REVIEW</Text><Text accessibilityRole="header" style={styles.title}>Record expected bill</Text><Text style={styles.subtitle}>Nothing has been added to your ledger yet. Confirm the exact record below.</Text>
      <View style={styles.card}><Row label="Description" value={bill.template.description} /><Row label="Amount" value={formatMinor(bill.template.amountMinor, ledger)} /><Row label="Category" value={bill.template.categoryId} /><Row label="Date" value={bill.dueOn} /><Row label="Recurring" value="Yes" /></View>
      <Text style={styles.notice}>Finova does not verify that a payment occurred and does not move money. You can edit or delete the resulting ledger entry later.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityLabel={`Confirm and record ${bill.template.description} bill`} accessibilityRole="button" disabled={busy} onPress={() => void record()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Recording…' : 'Confirm and record'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: spacing.sm }, title: { color: colors.text, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' }, row: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 4, padding: spacing.md }, label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, value: { color: colors.text, fontSize: 15, fontWeight: '800' }, notice: { backgroundColor: colors.inkRaised, borderRadius: radius.sm, color: colors.textMuted, fontSize: 12, lineHeight: 18, padding: spacing.md }, error: { color: colors.coral, fontSize: 13 }, primary: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, justifyContent: 'center', minHeight: 54 }, primaryText: { color: colors.ink, fontWeight: '900' }, cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, cancelText: { color: colors.textMuted, fontWeight: '800' },
});
