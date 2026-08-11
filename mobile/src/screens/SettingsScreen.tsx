import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useFinance } from '../data/FinanceProvider';
import { colors, radius, spacing } from '../design/tokens';
import { ArtifactStore, shareOwnedArtifact } from '../services/artifacts';
import { exportEncryptedBackup } from '../services/backupExporter';
import { exportCsv as exportStreamingCsv } from '../services/csvExporter';
import { deleteAllAppData } from '../services/deleteAllData';
import { pickEncryptedBackupForImport, type PendingEncryptedBackup } from '../services/importBackup';
import type { StableBackupRepository } from '../services/backupExporter';
import type { ImportableBackupRepository } from '../services/backupImporter';
import { FinovaPreferenceStore } from '../services/preferences';

export interface SettingsOperations {
  cleanupArtifacts(): Promise<void>;
  exportEncryptedBackup(
    repository: StableBackupRepository,
    password: string,
  ): Promise<void>;
  exportStreamingCsv(repository: StableBackupRepository): Promise<void>;
  pickEncryptedBackup(password: string): Promise<PendingEncryptedBackup | null>;
  clearPreferences?(): Promise<void>;
}

let artifactStore: ArtifactStore | undefined;

function getArtifactStore(): ArtifactStore {
  artifactStore ??= new ArtifactStore();
  return artifactStore;
}

const defaultOperations: SettingsOperations = {
  cleanupArtifacts: () => getArtifactStore().cleanupAll(),
  exportEncryptedBackup: async (repository, password) => {
    const store = getArtifactStore();
    const receipt = await exportEncryptedBackup({ repository, artifacts: store, password });
    await shareOwnedArtifact(store, undefined, receipt.uri, {
      mimeType: 'application/octet-stream',
      UTI: 'com.avinashamanchi.finova.backup',
    });
  },
  exportStreamingCsv: async (repository) => {
    const store = getArtifactStore();
    const receipt = await exportStreamingCsv({ repository, artifacts: store });
    await shareOwnedArtifact(store, undefined, receipt.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  },
  pickEncryptedBackup: pickEncryptedBackupForImport,
  clearPreferences: () => new FinovaPreferenceStore().clear(),
};

export function SettingsScreen({
  onPrivacy,
  onSupport,
  onTerms = () => {},
  onPlans = () => {},
  onExpectedBills = () => {},
  onSavingsGoals = () => {},
  isPlus = false,
  operations = defaultOperations,
}: {
  onPrivacy: () => void;
  onSupport: () => void;
  onTerms?: () => void;
  onPlans?: () => void;
  onExpectedBills?: () => void;
  onSavingsGoals?: () => void;
  isPlus?: boolean;
  operations?: SettingsOperations;
}) {
  const finance = useFinance();
  const [deletePhrase, setDeletePhrase] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirmation, setBackupPasswordConfirmation] = useState('');
  const passwordReady = Array.from(backupPassword).length >= 12
    && Array.from(backupPassword).length <= 128;
  const backupPasswordsMatch = backupPassword === backupPasswordConfirmation;

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
      if (!finance.portability) throw new Error('Encrypted portability is unavailable in this build.');
      const pending = await operations.pickEncryptedBackup(backupPassword);
      if (!pending) {
        setStatus('No backup was selected. Your data is unchanged.');
        return;
      }
      const count = Object.values(pending.manifest.counts).reduce((sum, value) => sum + value, 0);
      Alert.alert(
        'Replace all Finova data?',
        `This authenticated backup contains ${count} records. Replacing this installation cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => void pending.discard() },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => void perform('replace', async () => {
              await pending.importInto(finance.portability! as ImportableBackupRepository);
              await finance.refreshAfterDataReplacement();
            }, 'The authenticated backup replaced this installation’s active data.'),
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
      preferences: { clear: operations.clearPreferences ?? (async () => {}) },
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
        <View style={styles.passwordPanel}>
            <Text style={styles.passwordLabel}>Backup password</Text>
            <TextInput
              accessibilityLabel="Backup password"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setBackupPassword}
              placeholder="12–128 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              style={styles.deleteInput}
              value={backupPassword}
            />
            <Text style={styles.passwordLabel}>Confirm password for export</Text>
            <TextInput
              accessibilityLabel="Confirm backup password"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setBackupPasswordConfirmation}
              placeholder="Repeat password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              style={styles.deleteInput}
              value={backupPasswordConfirmation}
            />
            {backupPasswordConfirmation && !backupPasswordsMatch ? <Text accessibilityRole="alert" style={styles.passwordMismatch}>The backup passwords do not match.</Text> : null}
            <Text style={styles.footnote}>Finova cannot recover this password. Confirm it to export; only the first field is used to inspect or import an existing encrypted file.</Text>
        </View>
        <ActionRow icon="document-text-outline" label="Export encrypted backup" detail="Authenticated Finova file with transactions, plans, bills, and goals" accessibilityLabel="Export Finova backup" testID="settings-export-backup" disabled={busy !== null || !finance.ledger || !passwordReady || !backupPasswordsMatch || !finance.portability} onPress={() => void perform('backup', async () => {
          if (!finance.portability) throw new Error('Encrypted portability is unavailable in this build.');
          await operations.exportEncryptedBackup(finance.portability, backupPassword);
          setBackupPassword('');
          setBackupPasswordConfirmation('');
        }, 'The backup share sheet closed. Finova cannot confirm delivery or storage by another app.')} />
        <ActionRow icon="grid-outline" label="Export transaction CSV" detail={isPlus ? 'Spreadsheet-compatible ledger; budgets are not included' : 'Finova Plus feature; encrypted backup remains free'} accessibilityLabel="Export transaction CSV" testID="settings-export-csv" disabled={busy !== null || !finance.portability} onPress={() => {
          if (!isPlus) { onPlans(); return; }
          void perform('csv', async () => {
            if (!finance.portability) throw new Error('Streaming export is unavailable in this build.');
            await operations.exportStreamingCsv(finance.portability);
          }, 'The CSV share sheet closed. Finova cannot confirm delivery or storage by another app.');
        }} />
        <ActionRow icon="download-outline" label="Import encrypted backup" detail="Authenticates and validates first, then asks before replacing all active data" accessibilityLabel="Import Finova backup" testID="settings-import-backup" disabled={busy !== null || !passwordReady || !finance.portability} onPress={() => void importBackup()} />
        <Text style={styles.footnote}>The share sheet opening does not prove another app saved, delivered, or protected the file.</Text>
      </Section>

      <Section title="About Finova" detail="Plain-language product boundaries.">
        <ActionRow icon="sparkles-outline" label={isPlus ? 'Finova Plus active' : 'Finova Free'} detail={isPlus ? 'Unlimited budgets, rollover, expected bills, goals, insights, and CSV' : 'View the one-time Plus unlock'} accessibilityLabel="View Finova plans" onPress={onPlans} />
        <ActionRow icon="calendar-outline" label="Expected bills" detail="Recurring dates with explicit recording confirmation" accessibilityLabel="Open expected bills" onPress={onExpectedBills} />
        <ActionRow icon="flag-outline" label="Savings goals" detail="Planning progress only; no money is moved" accessibilityLabel="Open savings goals" onPress={onSavingsGoals} />
        <ActionRow icon="shield-checkmark-outline" label="Privacy and data" detail="Local storage, exports, backups, and deletion" accessibilityLabel="Open privacy information" onPress={onPrivacy} />
        <ActionRow icon="document-text-outline" label="Terms of Use" detail="Product limits and one-time purchase terms" accessibilityLabel="Open Terms of Use" onPress={onTerms} />
        <ActionRow icon="help-circle-outline" label="Support and limits" detail="How calculations work and what Finova cannot do" accessibilityLabel="Open support information" onPress={onSupport} />
      </Section>

      <View style={styles.danger}>
        <Text style={styles.dangerTitle}>Delete All Data</Text>
        <Text style={styles.dangerDetail}>Removes active transactions, budget plans, recurring templates, expected bills, savings goals, contribution records, preferences, and Finova-owned temporary artifacts from this installation. Apple purchase history is not deleted or refunded. An existing device backup may restore earlier data.</Text>
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
  passwordPanel: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, padding: spacing.md }, passwordLabel: { color: colors.text, fontSize: 13, fontWeight: '800' }, passwordMismatch: { color: colors.coral, fontSize: 12, fontWeight: '700' },
  action: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 76, padding: spacing.md }, actionIcon: { alignItems: 'center', backgroundColor: colors.jadeDark, borderRadius: 12, height: 40, justifyContent: 'center', width: 40 }, actionCopy: { flex: 1, gap: 3 }, actionLabel: { color: colors.text, fontSize: 14, fontWeight: '800' }, actionDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, disabled: { opacity: 0.42 }, footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 16, padding: spacing.md },
  danger: { backgroundColor: '#2B1C22', borderColor: '#643641', borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md }, dangerTitle: { color: colors.coral, fontSize: 17, fontWeight: '900' }, dangerDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, deleteLabel: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: spacing.xs }, deleteInput: { backgroundColor: colors.ink, borderColor: '#643641', borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 50, paddingHorizontal: spacing.md }, deleteButton: { alignItems: 'center', backgroundColor: colors.coral, borderRadius: radius.sm, justifyContent: 'center', minHeight: 50 }, deleteButtonText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
});
