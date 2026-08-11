import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntitlementStatus } from '../access/entitlements';
import { Screen } from '../components/Screen';
import type { RecurringRepository } from '../data/recurringRepository';
import { formatMinor } from '../domain/money';
import type { ExpectedBill } from '../domain/recurrence';
import type { Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';

function localToday(): string {
  const value = new Date();
  return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const STATUS_COPY = {
  overdue: 'Overdue',
  due: 'Due today',
  upcoming: 'Upcoming',
  recorded: 'Recorded',
} as const;

export function ExpectedBillsScreen({
  repository,
  ledger,
  entitlement,
  onNewTemplate,
  onEditTemplate,
  onRecord,
  onUpgrade,
}: Readonly<{
  repository: RecurringRepository;
  ledger: Ledger;
  entitlement: EntitlementStatus;
  onNewTemplate(): void;
  onEditTemplate(bill: ExpectedBill): void;
  onRecord(bill: ExpectedBill): void;
  onUpgrade(): void;
}>) {
  const [bills, setBills] = useState<readonly ExpectedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = localToday();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (entitlement === 'active') await repository.materializeExpectedOccurrences(today);
      setBills(await repository.listExpectedBills(
        shiftDate(today, -120),
        shiftDate(today, 180),
        today,
      ));
    } catch {
      setError('Expected bills could not be loaded safely. Try again.');
    } finally {
      setLoading(false);
    }
  }, [entitlement, repository, today]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PLANNED, NEVER AUTOMATIC</Text>
        <Text accessibilityRole="header" style={styles.title}>Expected bills</Text>
        <Text style={styles.subtitle}>Finova shows expected dates. It never moves money or records a transaction until you confirm.</Text>
      </View>
      <Pressable
        accessibilityLabel={entitlement === 'active' ? 'Add recurring bill' : 'Unlock recurring bill planning'}
        accessibilityRole="button"
        onPress={entitlement === 'active' ? onNewTemplate : onUpgrade}
        style={styles.primary}
      >
        <Ionicons color={colors.ink} name="add-circle-outline" size={20} />
        <Text style={styles.primaryText}>{entitlement === 'active' ? 'Add recurring bill' : 'Recurring planning is in Plus'}</Text>
      </Pressable>
      {entitlement === 'unknown' ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>Purchase status is temporarily unavailable. Existing expected bills stay visible; creating new ones remains locked until verification succeeds.</Text>
      ) : null}
      {loading ? <ActivityIndicator accessibilityLabel="Loading expected bills" color={colors.jade} /> : null}
      {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void reload()}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
      {!loading && !error && bills.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>No expected bills yet</Text><Text style={styles.subtitle}>Add a monthly bill to see overdue, due, upcoming, and recorded states here.</Text></View>
      ) : null}
      {bills.map((bill) => (
        <View key={bill.id} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardCopy}>
              <Text style={styles.billName}>{bill.template.description}</Text>
              <Text style={styles.billMeta}>{bill.dueOn} · {formatMinor(bill.template.amountMinor, ledger)}</Text>
            </View>
            <Text style={[styles.status, bill.status === 'overdue' && styles.overdue]}>{STATUS_COPY[bill.status]}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityLabel={`Edit recurring ${bill.template.description}`} accessibilityRole="button" onPress={() => entitlement === 'active' ? onEditTemplate(bill) : onUpgrade} style={styles.secondary}><Text style={styles.secondaryText}>Edit plan</Text></Pressable>
            {bill.status !== 'recorded' ? (
              <Pressable accessibilityLabel={`Record expected ${bill.template.description} bill`} accessibilityRole="button" onPress={() => onRecord(bill)} style={styles.secondary}><Text style={styles.secondaryText}>Review & record</Text></Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 5, paddingTop: spacing.sm },
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  primary: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.md, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  notice: { backgroundColor: colors.inkRaised, borderRadius: radius.sm, color: colors.textMuted, fontSize: 12, lineHeight: 18, padding: spacing.md },
  error: { backgroundColor: '#3B2327', borderColor: colors.coral, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.text, fontSize: 13 }, retry: { color: colors.coral, fontWeight: '900' },
  empty: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  cardTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' }, cardCopy: { flex: 1, gap: 4 },
  billName: { color: colors.text, fontSize: 16, fontWeight: '900' }, billMeta: { color: colors.textMuted, fontSize: 12 },
  status: { backgroundColor: colors.jadeDark, borderRadius: radius.pill, color: colors.jade, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6 },
  overdue: { backgroundColor: '#3B2327', color: colors.coral },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  secondary: { borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md }, secondaryText: { color: colors.text, fontSize: 12, fontWeight: '800' },
});
