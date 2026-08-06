import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinance } from '../data/FinanceProvider';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../domain/categories';
import { parseAmountToCents } from '../domain/money';
import type { Transaction, TransactionKind } from '../domain/types';
import { isValidDateKey } from '../data/validation';
import { colors, radius, spacing } from '../design/tokens';

function todayKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function TransactionEditor({ transaction, onSaved, onCancel }: {
  transaction?: Transaction; onSaved: (transaction: Transaction) => void; onCancel: () => void;
}) {
  const finance = useFinance();
  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? 'expense');
  const [amount, setAmount] = useState(transaction ? (transaction.amountCents / 100).toFixed(2) : '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [date, setDate] = useState(transaction?.occurredOn ?? todayKey());
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? 'groceries');
  const [isRecurring, setIsRecurring] = useState(transaction?.isRecurring ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const categories = useMemo(() => kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, [kind]);

  const chooseKind = (next: TransactionKind) => {
    setKind(next);
    setCategoryId(next === 'income' ? 'salary' : 'groceries');
    setErrors({});
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const parsed = parseAmountToCents(amount);
    if (!parsed.ok) nextErrors.amount = parsed.message;
    const trimmedDescription = description.trim();
    if (Array.from(trimmedDescription).length < 1 || Array.from(trimmedDescription).length > 120) nextErrors.description = 'Add a description between 1 and 120 characters.';
    if (!isValidDateKey(date)) nextErrors.date = 'Use a real date in YYYY-MM-DD format.';
    if (nextErrors.amount || nextErrors.description || nextErrors.date || !parsed.ok) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const draft = { kind, amountCents: parsed.cents, categoryId, description: trimmedDescription, occurredOn: date, isRecurring };
      const saved = transaction
        ? await finance.updateTransaction(transaction.id, draft)
        : await finance.createTransaction(draft);
      onSaved(saved);
    } catch {
      setErrors({ form: 'Transaction could not be saved. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>{transaction ? 'EDIT LEDGER ITEM' : 'NEW LEDGER ITEM'}</Text>
          <Text style={styles.title}>{transaction ? 'Update transaction' : 'Add transaction'}</Text>
          <Text style={styles.subtitle}>Stored locally. You can edit or delete it any time.</Text>

          <View accessibilityRole="tablist" style={styles.kindRow}>
            {(['expense', 'income'] as const).map((value) => (
              <Pressable
                accessibilityLabel={`${value === 'expense' ? 'Expense' : 'Income'} type`}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === value }}
                key={value}
                onPress={() => chooseKind(value)}
                style={[styles.kind, kind === value && styles.kindActive]}
              >
                <Ionicons color={kind === value ? colors.ink : colors.textMuted} name={value === 'expense' ? 'arrow-down' : 'arrow-up'} size={18} />
                <Text style={[styles.kindText, kind === value && styles.kindTextActive]}>{value === 'expense' ? 'Expense' : 'Income'}</Text>
              </Pressable>
            ))}
          </View>

          <Field label="Amount" error={errors.amount}>
            <View style={styles.amountWrap}><Text style={styles.currency}>$</Text><TextInput accessibilityLabel="Amount" keyboardType="decimal-pad" onChangeText={(value) => { setAmount(value); setErrors((current) => ({ ...current, amount: '' })); }} placeholder="0.00" placeholderTextColor={colors.textMuted} style={styles.input} testID="transaction-amount" value={amount} /></View>
          </Field>

          <Field label="Description" error={errors.description}>
            <TextInput accessibilityLabel="Description" maxLength={120} onChangeText={(value) => { setDescription(value); setErrors((current) => ({ ...current, description: '' })); }} placeholder="What was this for?" placeholderTextColor={colors.textMuted} style={styles.textInput} testID="transaction-description" value={description} />
          </Field>

          <Field label="Date" error={errors.date}>
            <TextInput accessibilityLabel="Date YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={(value) => { setDate(value); setErrors((current) => ({ ...current, date: '' })); }} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.textInput} testID="transaction-date" value={date} />
          </Field>

          <View style={styles.field}><Text style={styles.label}>Category</Text><View style={styles.categories}>{categories.map((category) => (
            <Pressable accessibilityLabel={`${category.label} category`} accessibilityRole="radio" accessibilityState={{ checked: categoryId === category.id }} key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.category, categoryId === category.id && styles.categoryActive]} testID={`category-${category.id}`}>
              <Ionicons color={categoryId === category.id ? colors.jade : colors.textMuted} name={category.icon as never} size={17} />
              <Text style={[styles.categoryText, categoryId === category.id && styles.categoryTextActive]}>{category.label}</Text>
            </Pressable>
          ))}</View></View>

          <View style={styles.recurring}><View><Text style={styles.recurringTitle}>Recurring item</Text><Text style={styles.recurringDetail}>A label only—Finova never creates transactions automatically.</Text></View><Switch accessibilityLabel="Recurring transaction" onValueChange={setIsRecurring} trackColor={{ false: colors.border, true: colors.jadeDark }} thumbColor={isRecurring ? colors.jade : colors.textMuted} value={isRecurring} /></View>

          {errors.form ? <Text accessibilityLiveRegion="polite" style={styles.error}>{errors.form}</Text> : null}
          <Pressable accessibilityLabel="Save transaction" accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.save} testID="transaction-save"><Text style={styles.saveText}>{saving ? 'Saving…' : transaction ? 'Save changes' : 'Add transaction'}</Text></Pressable>
          <Pressable accessibilityLabel="Cancel transaction editor" accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}{error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.ink, flex: 1 }, fill: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: 80 },
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  kindRow: { backgroundColor: colors.inkRaised, borderRadius: radius.md, flexDirection: 'row', gap: 4, padding: 4 },
  kind: { alignItems: 'center', borderRadius: radius.sm, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 48 },
  kindActive: { backgroundColor: colors.jade }, kindText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' }, kindTextActive: { color: colors.ink },
  field: { gap: spacing.xs }, label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  amountWrap: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 56, paddingHorizontal: spacing.md },
  currency: { color: colors.jade, fontSize: 22, fontWeight: '800' }, input: { color: colors.text, flex: 1, fontSize: 22, fontVariant: ['tabular-nums'], minHeight: 54, paddingHorizontal: spacing.sm },
  textInput: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 54, paddingHorizontal: spacing.md },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  category: { alignItems: 'center', backgroundColor: colors.inkRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 44, paddingHorizontal: spacing.sm },
  categoryActive: { backgroundColor: colors.jadeDark, borderColor: colors.jade }, categoryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, categoryTextActive: { color: colors.jade },
  recurring: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 70, padding: spacing.md },
  recurringTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, recurringDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 16, maxWidth: 260, marginTop: 3 },
  error: { color: colors.coral, fontSize: 13, lineHeight: 18 },
  save: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, justifyContent: 'center', minHeight: 54 }, saveText: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, cancelText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
});
