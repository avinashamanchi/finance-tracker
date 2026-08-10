import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { colors, radius, spacing } from '../design/tokens';

export default function PrivacyScreen() {
  return (
    <Screen>
      <Text style={styles.eyebrow}>PRIVACY</Text>
      <Text accessibilityRole="header" style={styles.title}>Your ledger belongs to you.</Text>
      <Text style={styles.intro}>Ledger, planning, recurring-bill, and savings-goal data stays on this device unless you explicitly export or share it.</Text>
      <Policy title="What Finova stores"><Text style={styles.body}>Finova stores the records you enter in its local database. A password-encrypted Finova backup or CSV file is created only after you choose an export and is removed from Finova’s temporary storage after the share sheet closes.</Text></Policy>
      <Policy title="What Finova does not use"><Text style={styles.body}>There is no account, bank connection, ads, tracking, or behavioral product-usage analytics. Finova does not request contacts, location, photos, camera, microphone, health, banking, or advertising access.</Text></Policy>
      <Policy title="Finova Plus purchases"><Text style={styles.body}>Finova does not send your ledger, amounts, descriptions, categories, backups, or support report to RevenueCat. Apple and RevenueCat process an anonymous app-user identifier, product and purchase/entitlement information, and technical request metadata to offer and restore the one-time Finova Plus purchase. Finova does not receive full payment-card details.</Text></Policy>
      <Policy title="Exports and imports"><Text style={styles.body}>When you export, you choose another app or location through the iOS share sheet. That destination controls its copy. Encrypted backup import authenticates the entire copied file and its declared record counts before showing replacement confirmation, stages records separately, and replaces active data only after all checks pass. CSV is readable spreadsheet data and is not encrypted.</Text></Policy>
      <Policy title="Deletion and device backups"><Text style={styles.body}>Delete All removes active app data, preferences, and Finova-owned temporary artifacts from this installation. Finova has no user account to delete. Delete All does not cancel or refund the non-consumable, erase Apple’s purchase record, or erase RevenueCat’s entitlement record. Restore Purchases rechecks the current Apple account. An existing device backup may restore data deleted from the active app.</Text></Policy>
      <Policy title="Security boundary"><Text style={styles.body}>Local-only and encrypted backup do not guarantee confidentiality. Device access, screenshots, shared CSV files, malware, weak or reused backup passwords, and computer backups can expose financial entries. Use your device passcode, a unique backup password, and protect every exported file.</Text></Policy>
    </Screen>
  );
}

function Policy({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: spacing.sm },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 }, intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
});
