import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import type { EntitlementStatus } from '../access/entitlements';
import { Screen } from '../components/Screen';
import type { PlanningRepository } from '../data/planningRepository';
import { minorToDecimal, parseMinorAmount } from '../domain/money';
import type { Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

export function SavingsGoalEditor({ repository, ledger, entitlement, onSaved, onCancel, onUpgrade }: Readonly<{
  repository: PlanningRepository;
  ledger: Ledger;
  entitlement: EntitlementStatus;
  onSaved(): void;
  onCancel(): void;
  onUpgrade(): void;
}>) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetOn, setTargetOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (entitlement !== 'active') {
    return <Screen><Text accessibilityRole="header" style={styles.title}>Savings goals are in Finova Plus.</Text><Text style={styles.subtitle}>Existing goals remain available. New planning actions require verified Plus access.</Text><Pressable accessibilityRole="button" onPress={onUpgrade} style={styles.primary}><Text style={styles.primaryText}>View Finova Plus</Text></Pressable><Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></Screen>;
  }
  const save = async () => {
    const parsed = parseMinorAmount(target, ledger.currencyMinorUnit);
    if (!parsed.ok) { setError(parsed.message); return; }
    setSaving(true); setError(null);
    try {
      await repository.createGoal({ id: Crypto.randomUUID(), ledgerId: ledger.id, name: name.trim(), targetMinor: parsed.minor, targetOn: targetOn.trim() || null });
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Savings goal could not be created.');
    } finally { setSaving(false); }
  };
  return (
    <Screen>
      <Text style={styles.eyebrow}>PLANNING ONLY</Text><Text accessibilityRole="header" style={styles.title}>Create savings goal</Text><Text style={styles.subtitle}>This records a target. No money is moved, reserved, or verified.</Text>
      <Text style={styles.label}>Name</Text><TextInput accessibilityLabel="Savings goal name" maxLength={80} onChangeText={setName} placeholder="Emergency fund" placeholderTextColor={colors.textMuted} style={styles.input} value={name} />
      <Text style={styles.label}>Target ({ledger.currencyCode})</Text><TextInput accessibilityLabel="Savings goal target" keyboardType="decimal-pad" onChangeText={setTarget} placeholder={minorToDecimal(0, ledger.currencyMinorUnit)} placeholderTextColor={colors.textMuted} style={styles.input} value={target} />
      <Text style={styles.label}>Target date (optional)</Text><TextInput accessibilityLabel="Savings goal target date" autoCapitalize="none" maxLength={10} onChangeText={setTargetOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} value={targetOn} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityLabel="Save savings goal" accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Create goal'}</Text></Pressable><Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: spacing.sm }, title: { color: colors.text, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, label: { color: colors.text, fontSize: 13, fontWeight: '800' }, input: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.md }, error: { color: colors.coral, fontSize: 13 }, primary: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, justifyContent: 'center', minHeight: 54 }, primaryText: { color: colors.ink, fontSize: 15, fontWeight: '900' }, cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.5 },
});
