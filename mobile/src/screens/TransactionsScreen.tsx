import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';
import { useFinance } from '../data/FinanceProvider';
import { getCategory } from '../domain/categories';
import { colors, radius, spacing } from '../design/tokens';

type Filter = 'all' | 'income' | 'expense';

export function TransactionsScreen({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const finance = useFinance();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return finance.transactions.filter((transaction) => {
      if (filter !== 'all' && transaction.kind !== filter) return false;
      if (!normalized) return true;
      return transaction.description.toLocaleLowerCase().includes(normalized)
        || (getCategory(transaction.categoryId)?.label.toLocaleLowerCase().includes(normalized) ?? false);
    });
  }, [filter, finance.transactions, query]);

  const confirmDelete = (id: string, description: string) => {
    Alert.alert('Delete transaction?', `${description} will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void finance.deleteTransaction(id) },
    ]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>LEDGER</Text><Text style={styles.title}>Transactions</Text><Text style={styles.subtitle}>{finance.transactions.length} total on this device</Text></View>
        <Pressable accessibilityLabel="Add transaction" accessibilityRole="button" onPress={onAdd} style={styles.add}><Ionicons color={colors.ink} name="add" size={25} /></Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons color={colors.textMuted} name="search" size={18} />
        <TextInput
          accessibilityLabel="Search transactions"
          onChangeText={setQuery}
          placeholder="Search description or category"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          value={query}
        />
        {query ? <Pressable accessibilityLabel="Clear transaction search" onPress={() => setQuery('')} style={styles.clear}><Ionicons color={colors.textMuted} name="close-circle" size={20} /></Pressable> : null}
      </View>

      <View accessibilityRole="tablist" style={styles.filters}>
        {(['all', 'expense', 'income'] as const).map((value) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === value }}
            key={value}
            onPress={() => setFilter(value)}
            style={[styles.filter, filter === value && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'all' ? 'All' : value === 'expense' ? 'Expenses' : 'Income'}</Text>
          </Pressable>
        ))}
      </View>

      {finance.transactions.length === 0 ? (
        <EmptyState title="No transactions yet" detail="Your ledger is empty and private by default." actionLabel="Add first transaction" onAction={onAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching transactions" detail="Try another search or filter. Your original ledger is unchanged." />
      ) : (
        <View style={styles.list}>{filtered.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            onDelete={() => confirmDelete(transaction.id, transaction.description)}
            onEdit={() => onEdit(transaction.id)}
            transaction={transaction}
          />
        ))}</View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8, marginTop: 3 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  add: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: 16, height: 50, justifyContent: 'center', width: 50 },
  search: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: spacing.sm },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, minHeight: 48, paddingHorizontal: spacing.sm },
  clear: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  filters: { backgroundColor: colors.inkRaised, borderRadius: radius.pill, flexDirection: 'row', padding: 4 },
  filter: { alignItems: 'center', borderRadius: radius.pill, flex: 1, justifyContent: 'center', minHeight: 44 },
  filterActive: { backgroundColor: colors.panelSoft },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: colors.jade },
  list: { gap: spacing.sm },
});
