import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { colors, radius, spacing } from '../design/tokens';

export default function SupportScreen() {
  return (
    <Screen>
      <Text style={styles.eyebrow}>SUPPORT & LIMITS</Text>
      <Text accessibilityRole="header" style={styles.title}>Know what the numbers mean.</Text>
      <Text style={styles.intro}>Finova is a private record-keeping and visualization tool. It is not financial, tax, legal, credit, or investment advice.</Text>
      <Help title="Totals look wrong"><Text style={styles.body}>Review transaction type, amount, date, and category. Missing or incorrect entries change every dashboard, budget, and insight calculation.</Text></Help>
      <Help title="A budget says over limit"><Text style={styles.body}>Budgets compare recorded expenses with the limit you set. They do not block a purchase, inspect a bank account, predict a bill, or send money.</Text></Help>
      <Help title="Restore a backup"><Text style={styles.body}>Settings → Import JSON backup validates the file before asking to replace active data. Import is all-or-nothing; it does not merge ledgers.</Text></Help>
      <Help title="Recover deleted data"><Text style={styles.body}>Finova cannot recover deleted data. An older device backup might restore earlier entries, but Finova cannot inspect or manage that backup for you.</Text></Help>
      <Help title="Export troubleshooting"><Text style={styles.body}>A share sheet closing does not prove another app saved the file. Check the destination you selected. Finova deletes its temporary export after the sheet closes.</Text></Help>
      <Help title="Restore Finova Plus"><Text style={styles.body}>Open Settings, choose View Finova plans, then Restore Purchases while signed into the Apple account that bought the one-time unlock. Restoring Plus does not restore deleted ledger entries; use your own JSON or device backup for finance data.</Text></Help>
      <View style={styles.notice}><Text style={styles.noticeTitle}>Interactive support</Text><Text style={styles.body}>Interactive support is not yet available in the app. The public project repository and release notes are the current support reference.</Text></View>
    </Screen>
  );
}

function Help({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }

const styles = StyleSheet.create({
  eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: spacing.sm }, title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 }, intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  notice: { backgroundColor: colors.jadeDark, borderColor: colors.jade, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }, noticeTitle: { color: colors.jade, fontSize: 15, fontWeight: '900' },
});
