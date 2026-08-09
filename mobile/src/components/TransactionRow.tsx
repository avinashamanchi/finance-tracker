import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCategory } from '../domain/categories';
import { formatMinor } from '../domain/money';
import type { Ledger, Transaction } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

export function TransactionRow({ transaction, ledger, onEdit, onDelete }: {
  transaction: Transaction; ledger: Ledger; onEdit?: () => void; onDelete?: () => void;
}) {
  const category = getCategory(transaction.categoryId);
  const signedAmount = transaction.kind === 'income'
    ? formatMinor(transaction.amountMinor, ledger)
    : `-${formatMinor(transaction.amountMinor, ledger)}`;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Edit ${transaction.description}`}
        accessibilityRole="button"
        disabled={!onEdit}
        onPress={onEdit}
        style={styles.main}
      >
        <View style={[styles.icon, { backgroundColor: `${category?.color ?? colors.textMuted}22` }]}>
          <Ionicons color={category?.color ?? colors.textMuted} name={(category?.icon ?? 'ellipse-outline') as never} size={20} />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.description}>{transaction.description}</Text>
          <Text style={styles.meta}>{category?.label ?? transaction.categoryId} · {transaction.occurredOn}</Text>
        </View>
        <Text style={[styles.amount, transaction.kind === 'income' ? styles.income : styles.expense]}>{signedAmount}</Text>
      </Pressable>
      {onDelete ? (
        <Pressable
          accessibilityLabel={`Delete ${transaction.description}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDelete}
          style={styles.delete}
        >
          <Ionicons color={colors.textMuted} name="trash-outline" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 72, paddingLeft: spacing.sm },
  main: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 70, paddingVertical: spacing.sm },
  icon: { alignItems: 'center', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1, gap: 3 },
  description: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  amount: { fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '800' },
  income: { color: colors.jade },
  expense: { color: colors.coral },
  delete: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 44 },
});
