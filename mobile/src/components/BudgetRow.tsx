import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ExpenseCategoryId } from '../domain/categories';
import { colors, radius, spacing } from '../design/tokens';
import { formatMinor, minorToDecimal, parseMinorAmount } from '../domain/money';
import type { Ledger } from '../domain/types';

export function BudgetRow({
  categoryId,
  label,
  color,
  ledger,
  spentMinor,
  limitMinor,
  onSave,
}: {
  categoryId: ExpenseCategoryId;
  label: string;
  color: string;
  ledger: Ledger;
  spentMinor: number;
  limitMinor: number;
  onSave(limitMinor: number): Promise<void>;
}) {
  const [amount, setAmount] = useState(
    limitMinor === 0 ? '0' : minorToDecimal(limitMinor, ledger.currencyMinorUnit),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const percent = limitMinor === 0 ? 0 : Math.round((spentMinor / limitMinor) * 100);
  const status = limitMinor === 0
    ? 'No limit set'
    : percent > 100
      ? `Over limit — ${percent}% used`
      : percent >= 80
        ? `Near limit — ${percent}% used`
        : `On track — ${percent}% used`;

  const save = async () => {
    const normalized = amount.trim();
    const zeroPattern = new RegExp(`^0(?:\\.0{1,${Math.max(1, ledger.currencyMinorUnit)}})?$`);
    const parsed = zeroPattern.test(normalized)
      ? { ok: true as const, minor: 0 }
      : parseMinorAmount(normalized, ledger.currencyMinorUnit);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.minor);
      setAmount(parsed.minor === 0 ? '0' : minorToDecimal(parsed.minor, ledger.currencyMinorUnit));
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
        <Text style={styles.spent}>{formatMinor(spentMinor, ledger)} spent</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { backgroundColor: percent >= 100 ? colors.coral : percent >= 80 ? colors.amber : color, width: `${Math.min(percent, 100)}%` }]} /></View>
      <Text style={[styles.status, percent > 100 ? styles.over : percent >= 80 ? styles.near : undefined]}>{status}</Text>
      <View style={styles.editor}>
        <View style={styles.amountWrap}>
          <Text style={styles.symbol}>{ledger.currencyCode}</Text>
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
