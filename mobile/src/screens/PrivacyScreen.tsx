import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { colors, radius, spacing } from '../design/tokens';

export default function PrivacyScreen() {
  return (
    <Screen>
      <Text style={styles.eyebrow}>PRIVACY</Text>
      <Text accessibilityRole="header" style={styles.title}>Your ledger belongs to you.</Text>
      <Text style={styles.intro}>Transaction and budget data stays on this device unless you explicitly export or share it.</Text>
      <Policy title="What Finova stores"><Text style={styles.body}>Finova stores the transactions and budgets you enter in its local database. Temporary JSON and CSV files are created only after you choose an export and are removed after the share sheet closes.</Text></Policy>
      <Policy title="What Finova does not use"><Text style={styles.body}>There is no account, bank connection, ads, tracking, or analytics. Finova does not request contacts, location, photos, camera, microphone, health, banking, or advertising access.</Text></Policy>
      <Policy title="Exports and imports"><Text style={styles.body}>When you export, you choose another app or location through the iOS share sheet. That destination controls its own storage and privacy. Import reads a copied file, validates it, asks for confirmation, then replaces active Finova data atomically.</Text></Policy>
      <Policy title="Deletion and device backups"><Text style={styles.body}>Delete All removes active app data and Finova-owned temporary artifacts from this installation. An existing device backup may restore data deleted from the active app. Manage iCloud or computer backups in Apple’s settings if you need those copies removed.</Text></Policy>
      <Policy title="Security boundary"><Text style={styles.body}>Local-only does not mean risk-free. Device access, screenshots, shared files, malware, and unencrypted computer backups can expose financial entries. Use your device passcode and protect exported files.</Text></Policy>
    </Screen>
  );
}

function Policy({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: spacing.sm },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 }, intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
});
