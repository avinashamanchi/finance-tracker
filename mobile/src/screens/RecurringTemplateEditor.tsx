import * as Crypto from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { EntitlementStatus } from '../access/entitlements';
import { Screen } from '../components/Screen';
import type { RecurringRepository } from '../data/recurringRepository';
import { EXPENSE_CATEGORIES, type ExpenseCategoryId } from '../domain/categories';
import { minorToDecimal, parseMinorAmount } from '../domain/money';
import type { RecurringTemplate } from '../domain/recurrence';
import { currentMonth } from '../domain/summaries';
import type { Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

function todayKey(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function RecurringTemplateEditor({
  repository,
  ledger,
  entitlement,
  initial,
  onSaved,
  onCancel,
  onUpgrade,
}: Readonly<{
  repository: RecurringRepository;
  ledger: Ledger;
  entitlement: EntitlementStatus;
  initial?: RecurringTemplate;
  onSaved(): void;
  onCancel(): void;
  onUpgrade(): void;
}>) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? minorToDecimal(initial.amountMinor, ledger.currencyMinorUnit) : '');
  const [categoryId, setCategoryId] = useState<ExpenseCategoryId>(initial?.categoryId ?? 'utilities');
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 1));
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth());
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = useMemo(() => initial ? 'Edit recurring bill' : 'Add recurring bill', [initial]);

  if (entitlement !== 'active') {
    return (
      <Screen>
        <Text accessibilityRole="header" style={styles.title}>Recurring planning is in Finova Plus.</Text>
        <Text style={styles.subtitle}>Existing plans remain readable. A verified Plus entitlement is required to create or edit one.</Text>
        <Pressable accessibilityRole="button" onPress={onUpgrade} style={styles.primary}><Text style={styles.primaryText}>View Finova Plus</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </Screen>
    );
  }

  const save = async () => {
    const parsed = parseMinorAmount(amount, ledger.currencyMinorUnit);
    const day = Number(dueDay);
    if (!parsed.ok || !Number.isSafeInteger(day) || day < 1 || day > 31) {
      setError(parsed.ok ? 'Due day must be from 1 through 31.' : parsed.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await repository.upsertTemplate({
        id: initial?.id ?? Crypto.randomUUID(),
        ledgerId: ledger.id,
        description: description.trim(),
        categoryId,
        amountMinor: parsed.minor,
        dueDay: day,
        startMonth,
        endMonth: endMonth.trim() || null,
        enabled,
      });
      await repository.materializeExpectedOccurrences(todayKey());
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Recurring bill could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.eyebrow}>NO AUTOMATIC SPENDING</Text>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>This creates expected dates only. Recording a real expense always requires another confirmation.</Text>
      <Field label="Description"><TextInput accessibilityLabel="Recurring description" maxLength={120} onChangeText={setDescription} placeholder="Internet bill" placeholderTextColor={colors.textMuted} style={styles.input} value={description} /></Field>
      <Field label={`Amount (${ledger.currencyCode})`}><TextInput accessibilityLabel="Recurring amount" keyboardType="decimal-pad" onChangeText={setAmount} placeholder={minorToDecimal(0, ledger.currencyMinorUnit)} placeholderTextColor={colors.textMuted} style={styles.input} value={amount} /></Field>
      <Field label="Due day"><TextInput accessibilityLabel="Recurring due day" keyboardType="number-pad" maxLength={2} onChangeText={setDueDay} placeholder="1" placeholderTextColor={colors.textMuted} style={styles.input} value={dueDay} /></Field>
      <View style={styles.twoColumns}>
        <View style={styles.flex}><Field label="Start month"><TextInput accessibilityLabel="Recurring start month" autoCapitalize="none" maxLength={7} onChangeText={setStartMonth} placeholder="YYYY-MM" placeholderTextColor={colors.textMuted} style={styles.input} value={startMonth} /></Field></View>
        <View style={styles.flex}><Field label="End month (optional)"><TextInput accessibilityLabel="Recurring end month" autoCapitalize="none" maxLength={7} onChangeText={setEndMonth} placeholder="YYYY-MM" placeholderTextColor={colors.textMuted} style={styles.input} value={endMonth} /></Field></View>
      </View>
      <View style={styles.field}><Text style={styles.label}>Category</Text><View style={styles.categories}>{EXPENSE_CATEGORIES.map((category) => (
        <Pressable accessibilityLabel={`${category.label} recurring category`} accessibilityRole="radio" accessibilityState={{ checked: categoryId === category.id }} key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.chip, categoryId === category.id && styles.chipActive]}><Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>{category.label}</Text></Pressable>
      ))}</View></View>
      <View style={styles.switchRow}><View style={styles.flex}><Text style={styles.label}>Plan enabled</Text><Text style={styles.subtitle}>Turning this off preserves recorded history and removes only unrecorded expected dates.</Text></View><Switch accessibilityLabel="Recurring plan enabled" onValueChange={setEnabled} value={enabled} /></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityLabel="Save recurring bill" accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save recurring bill'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 }, subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  field: { gap: spacing.xs }, label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  input: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.md },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, flex: { flex: 1, minWidth: 145 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, chip: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 42, paddingHorizontal: spacing.sm, paddingVertical: 11 }, chipActive: { backgroundColor: colors.jadeDark, borderColor: colors.jade }, chipText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, chipTextActive: { color: colors.jade },
  switchRow: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  error: { color: colors.coral, fontSize: 13, lineHeight: 18 }, primary: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.md }, primaryText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.5 },
});
