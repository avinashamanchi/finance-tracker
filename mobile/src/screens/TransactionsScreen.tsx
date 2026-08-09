import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';
import { useFinance } from '../data/FinanceProvider';
import type { TransactionKind } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

type Filter = 'all' | 'income' | 'expense';

export function TransactionsScreen({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const finance = useFinance();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setTransactionFilters } = finance;

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const kinds: readonly TransactionKind[] = filter === 'all' ? [] : [filter];
      void setTransactionFilters(kinds, query);
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [filter, query, setTransactionFilters]);

  const confirmDelete = (id: string, description: string) => {
    Alert.alert('Delete transaction?', `${description} will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void finance.deleteTransaction(id) },
    ]);
  };

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>LEDGER</Text><Text style={styles.title}>Transactions</Text><Text style={styles.subtitle}>{finance.transactions.length} loaded on this device</Text></View>
        <Pressable accessibilityLabel="Add transaction" accessibilityRole="button" onPress={onAdd} style={styles.add}><Ionicons color={colors.ink} name="add" size={25} /></Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons color={colors.textMuted} name="search" size={18} />
        <TextInput
          accessibilityLabel="Search transactions"
          maxLength={80}
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

      {finance.pageError ? <Text accessibilityRole="alert" style={styles.error}>{finance.pageError}</Text> : null}
      {finance.loading && finance.transactions.length === 0 ? (
        <ActivityIndicator accessibilityLabel="Loading transactions" color={colors.jade} />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={finance.transactions}
          keyExtractor={(transaction) => transaction.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={query.trim() || filter !== 'all'
            ? <EmptyState title="No matching transactions" detail="Try another search or filter. Your original ledger is unchanged." />
            : <EmptyState title="No transactions yet" detail="Your ledger is empty and private by default." actionLabel="Add first transaction" onAction={onAdd} />}
          ListFooterComponent={finance.transactions.length > 0 ? (
            <View style={styles.pageControls}>
              <Pressable
                accessibilityLabel="Load newer transactions"
                accessibilityRole="button"
                accessibilityState={{ disabled: !finance.hasNewerTransactions || finance.loadingNewerTransactions }}
                disabled={!finance.hasNewerTransactions || finance.loadingNewerTransactions}
                onPress={() => void finance.loadNewerTransactions()}
                style={styles.pageButton}
              ><Text style={styles.pageButtonText}>{finance.loadingNewerTransactions ? 'Loading…' : 'Load newer'}</Text></Pressable>
              <Pressable
                accessibilityLabel="Load older transactions"
                accessibilityRole="button"
                accessibilityState={{ disabled: !finance.hasOlderTransactions || finance.loadingOlderTransactions }}
                disabled={!finance.hasOlderTransactions || finance.loadingOlderTransactions}
                onPress={() => void finance.loadOlderTransactions()}
                style={styles.pageButton}
              ><Text style={styles.pageButtonText}>{finance.loadingOlderTransactions ? 'Loading…' : 'Load older'}</Text></Pressable>
            </View>
          ) : null}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onEndReached={() => {
            if (finance.hasOlderTransactions && !finance.loadingOlderTransactions) {
              void finance.loadOlderTransactions();
            }
          }}
          onEndReachedThreshold={0.4}
          onRefresh={() => void finance.reload()}
          refreshing={finance.loading}
          renderItem={({ item }) => (
            <TransactionRow
              ledger={finance.ledger!}
              onDelete={() => confirmDelete(item.id, item.description)}
              onEdit={() => onEdit(item.id)}
              transaction={item}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
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
  list: { flexGrow: 1, gap: spacing.sm, paddingBottom: 100 },
  pageControls: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.md },
  pageButton: { alignItems: 'center', backgroundColor: colors.inkRaised, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 120, paddingHorizontal: spacing.md },
  pageButtonText: { color: colors.jade, fontSize: 13, fontWeight: '800' },
  error: { color: colors.coral, fontSize: 13 },
});
