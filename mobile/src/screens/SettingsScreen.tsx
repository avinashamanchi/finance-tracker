import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useFinance } from '../data/FinanceProvider';
import type { TransactionExport } from '../data/financeRepository';
import type { FinanceSnapshot, Ledger } from '../domain/types';
import { colors, radius, spacing } from '../design/tokens';
import { ArtifactStore, shareTextArtifact } from '../services/artifacts';
import { serializeBackup } from '../services/backup';
import { transactionsToCsv } from '../services/csv';
import { deleteAllAppData } from '../services/deleteAllData';
import { pickFinovaBackup } from '../services/importBackup';

export interface SettingsOperations {
  exportBackup(snapshot: FinanceSnapshot, ledger: Ledger): Promise<void>;
  exportCsv(value: TransactionExport): Promise<void>;
  pickBackup(): Promise<FinanceSnapshot | null>;
  cleanupArtifacts(): Promise<void>;
}

let artifactStore: ArtifactStore | undefined;

function getArtifactStore(): ArtifactStore {
  artifactStore ??= new ArtifactStore();
  return artifactStore;
}

const defaultOperations: SettingsOperations = {
  exportBackup: async (snapshot, ledger) => {
    await shareTextArtifact(getArtifactStore(), undefined, 'finova-backup', 'json', serializeBackup(snapshot, ledger), 'application/json');
  },
  exportCsv: async ({ transactions, ledger }) => {
    await shareTextArtifact(getArtifactStore(), undefined, 'finova-transactions', 'csv', transactionsToCsv(transactions, ledger), 'text/csv');
  },
  pickBackup: pickFinovaBackup,
  cleanupArtifacts: () => getArtifactStore().cleanupAll(),
};

export function SettingsScreen({
  onPrivacy,
  onSupport,
  onTerms = () => {},
  onPlans = () => {},
  isPlus = false,
  operations = defaultOperations,
}: {
  onPrivacy: () => void;
  onSupport: () => void;
  onTerms?: () => void;
  onPlans?: () => void;
  isPlus?: boolean;
  operations?: SettingsOperations;
}) {
  const finance = useFinance();
  const [deletePhrase, setDeletePhrase] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const perform = async (name: string, operation: () => Promise<void>, success: string) => {
    setBusy(name);
    setStatus(null);
    try {
      await operation();
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The action could not be completed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async () => {
    setBusy('import');
    setStatus(null);
    try {
      const snapshot = await operations.pickBackup();
      if (!snapshot) {
        setStatus('No backup was selected. Your data is unchanged.');
        return;
      }
      Alert.alert(
        'Replace all Finova data?',
        'The validated backup will replace every active transaction and budget in this installation. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => void perform('replace', () => finance.replaceAll(snapshot), 'The validated backup replaced this installation’s active data.'),
          },
        ],
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The backup could not be imported.');
    } finally {
      setBusy(null);
    }
  };

  const deleteEverything = async () => {
    setBusy('delete');
    setStatus(null);
    const result = await deleteAllAppData({
      finance: { deleteAll: finance.deleteAllFinanceData },
      artifacts: { cleanupAll: operations.cleanupArtifacts },
      preferences: { clear: async () => {} },
    });
    if (result.ok) {
      setDeletePhrase('');
      setStatus('All active Finova data was deleted from this installation.');
    } else {
      setStatus(`Some data could not be deleted (${result.failed.join(', ')}). Keep this screen open and try Delete All again.`);
    }
    setBusy(null);
  };

  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>CONTROL CENTER</Text><Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>Your ledger stays local unless you choose an export or import action.</Text></View>

      {status ? <View accessibilityLiveRegion="polite" style={styles.status}><Text style={styles.statusText}>{status}</Text></View> : null}

      <Section title="Move your data" detail="Export creates a temporary file and opens the iOS share sheet.">
        <ActionRow icon="document-text-outline" label="Export JSON backup" detail="Transactions and budgets in a versioned Finova file" accessibilityLabel="Export Finova backup" testID="settings-export-backup" disabled={busy !== null || !finance.ledger} onPress={() => void perform('backup', async () => operations.exportBackup(await finance.snapshot(), finance.ledger!), 'The backup share sheet closed. Finova cannot confirm delivery or storage by another app.')} />
        <ActionRow icon="grid-outline" label="Export transaction CSV" detail={isPlus ? 'Spreadsheet-compatible ledger; budgets are not included' : 'Finova Plus feature; JSON backup remains free'} accessibilityLabel="Export transaction CSV" testID="settings-export-csv" disabled={busy !== null} onPress={() => {
          if (!isPlus) { onPlans(); return; }
          void perform('csv', async () => operations.exportCsv(await finance.readTransactionsForCsv()), 'The CSV share sheet closed. Finova cannot confirm delivery or storage by another app.');
        }} />
        <ActionRow icon="download-outline" label="Import JSON backup" detail="Validates first, then asks before replacing all active data" accessibilityLabel="Import Finova backup" testID="settings-import-backup" disabled={busy !== null} onPress={() => void importBackup()} />
        <Text style={styles.footnote}>The share sheet opening does not prove another app saved, delivered, or protected the file.</Text>
      </Section>

      <Section title="About Finova" detail="Plain-language product boundaries.">
        <ActionRow icon="sparkles-outline" label={isPlus ? 'Finova Plus active' : 'Finova Free'} detail={isPlus ? 'Unlimited budgets, six-month insights, and CSV export' : 'View the one-time Plus unlock'} accessibilityLabel="View Finova plans" onPress={onPlans} />
        <ActionRow icon="shield-checkmark-outline" label="Privacy and data" detail="Local storage, exports, backups, and deletion" accessibilityLabel="Open privacy information" onPress={onPrivacy} />
        <ActionRow icon="document-text-outline" label="Terms of Use" detail="Product limits and one-time purchase terms" accessibilityLabel="Open Terms of Use" onPress={onTerms} />
        <ActionRow icon="help-circle-outline" label="Support and limits" detail="How calculations work and what Finova cannot do" accessibilityLabel="Open support information" onPress={onSupport} />
      </Section>

      <View style={styles.danger}>
        <Text style={styles.dangerTitle}>Delete All Data</Text>
        <Text style={styles.dangerDetail}>Removes active transactions, budgets, and Finova-owned temporary artifacts from this installation. An existing device backup may restore earlier data.</Text>
        <Text style={styles.deleteLabel}>Type DELETE to continue</Text>
        <TextInput accessibilityLabel="Delete confirmation" autoCapitalize="characters" autoCorrect={false} onChangeText={setDeletePhrase} placeholder="DELETE" placeholderTextColor={colors.textMuted} style={styles.deleteInput} testID="settings-delete-confirmation" value={deletePhrase} />
        <Pressable accessibilityLabel="Delete all data" accessibilityRole="button" accessibilityState={{ disabled: deletePhrase !== 'DELETE' || busy !== null }} disabled={deletePhrase !== 'DELETE' || busy !== null} onPress={() => void deleteEverything()} style={[styles.deleteButton, (deletePhrase !== 'DELETE' || busy !== null) && styles.disabled]} testID="settings-delete-all"><Text style={styles.deleteButtonText}>{busy === 'delete' ? 'Deleting…' : 'Delete All Data'}</Text></Pressable>
      </View>
    </Screen>
  );
}

function Section({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDetail}>{detail}</Text></View>{children}</View>;
}

function ActionRow({ icon, label, detail, accessibilityLabel, testID, disabled, onPress }: {
  icon: string; label: string; detail: string; accessibilityLabel: string; testID?: string; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]} testID={testID}><View style={styles.actionIcon}><Ionicons color={colors.jade} name={icon as never} size={20} /></View><View style={styles.actionCopy}><Text style={styles.actionLabel}>{label}</Text><Text style={styles.actionDetail}>{detail}</Text></View><Ionicons color={colors.textMuted} name="chevron-forward" size={18} /></Pressable>;
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: spacing.sm }, eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  status: { backgroundColor: colors.jadeDark, borderColor: colors.jade, borderRadius: radius.md, borderWidth: 1, padding: spacing.md }, statusText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  section: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' }, sectionHeading: { gap: 3, padding: spacing.md }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' }, sectionDetail: { color: colors.textMuted, fontSize: 12 },
  action: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 76, padding: spacing.md }, actionIcon: { alignItems: 'center', backgroundColor: colors.jadeDark, borderRadius: 12, height: 40, justifyContent: 'center', width: 40 }, actionCopy: { flex: 1, gap: 3 }, actionLabel: { color: colors.text, fontSize: 14, fontWeight: '800' }, actionDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, disabled: { opacity: 0.42 }, footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 16, padding: spacing.md },
  danger: { backgroundColor: '#2B1C22', borderColor: '#643641', borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md }, dangerTitle: { color: colors.coral, fontSize: 17, fontWeight: '900' }, dangerDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, deleteLabel: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: spacing.xs }, deleteInput: { backgroundColor: colors.ink, borderColor: '#643641', borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 50, paddingHorizontal: spacing.md }, deleteButton: { alignItems: 'center', backgroundColor: colors.coral, borderRadius: radius.sm, justifyContent: 'center', minHeight: 50 }, deleteButtonText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
});
