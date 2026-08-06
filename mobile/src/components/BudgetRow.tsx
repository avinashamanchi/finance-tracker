import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ExpenseCategoryId } from '../domain/categories';
import { colors, radius, spacing } from '../design/tokens';
import { formatCents, parseAmountToCents } from '../domain/money';

export function BudgetRow({
  categoryId,
  label,
  color,
  spentCents,
  limitCents,
  onSave,
}: {
  categoryId: ExpenseCategoryId;
  label: string;
  color: string;
  spentCents: number;
  limitCents: number;
  onSave(limitCents: number): Promise<void>;
}) {
  const [amount, setAmount] = useState(limitCents === 0 ? '0' : (limitCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const percent = limitCents === 0 ? 0 : Math.round((spentCents / limitCents) * 100);
  const status = limitCents === 0
    ? 'No limit set'
    : percent > 100
      ? `Over limit — ${percent}% used`
      : percent >= 80
        ? `Near limit — ${percent}% used`
        : `On track — ${percent}% used`;

  const save = async () => {
    const normalized = amount.trim();
    const parsed = normalized === '0' || normalized === '0.00'
      ? { ok: true as const, cents: 0 }
      : parseAmountToCents(normalized);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.cents);
      setAmount(parsed.cents === 0 ? '0' : (parsed.cents / 100).toFixed(2));
    } catch {
      setError('Budget could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.titleRow}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.title}>{label}</Text></View>
        <Text style={styles.spent}>{formatCents(spentCents)} spent</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { backgroundColor: percent >= 100 ? colors.coral : percent >= 80 ? colors.amber : color, width: `${Math.min(percent, 100)}%` }]} /></View>
      <Text style={[styles.status, percent > 100 ? styles.over : percent >= 80 ? styles.near : undefined]}>{status}</Text>
      <View style={styles.editor}>
        <View style={styles.amountWrap}>
          <Text style={styles.symbol}>$</Text>
          <TextInput
            accessibilityLabel={`${label} budget amount`}
            keyboardType="decimal-pad"
            onChangeText={(value) => { setAmount(value); setError(null); }}
            selectTextOnFocus
            style={styles.input}
            testID={`budget-${categoryId}-amount`}
            value={amount}
          />
        </View>
        <Pressable
          accessibilityLabel={`Save ${label} budget`}
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={styles.save}
          testID={`budget-${categoryId}-save`}
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>Set 0 to remove this limit. Budget applies to every month.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  dot: { borderRadius: 5, height: 10, width: 10 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  spent: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { backgroundColor: colors.ink, borderRadius: radius.pill, height: 7, overflow: 'hidden' },
  fill: { borderRadius: radius.pill, height: 7 },
  status: { color: colors.jade, fontSize: 13, fontWeight: '700' },
  near: { color: colors.amber },
  over: { color: colors.coral },
  editor: { flexDirection: 'row', gap: spacing.sm },
  amountWrap: { alignItems: 'center', backgroundColor: colors.inkRaised, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.sm },
  symbol: { color: colors.textMuted, fontSize: 16 },
  input: { color: colors.text, flex: 1, fontSize: 16, fontVariant: ['tabular-nums'], minHeight: 46, paddingHorizontal: spacing.xs },
  save: { alignItems: 'center', backgroundColor: colors.jadeDark, borderColor: colors.jade, borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 48, minWidth: 72, paddingHorizontal: spacing.md },
  saveText: { color: colors.jade, fontSize: 14, fontWeight: '800' },
  error: { color: colors.coral, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
});
