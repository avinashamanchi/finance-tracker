import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../src/components/Screen';
import { colors, radius, spacing } from '../src/design/tokens';
import { PRIVACY_URL, TERMS_URL } from '../src/legal/links';

export default function TermsScreen() {
  return (
    <Screen>
      <Text style={styles.eyebrow}>TERMS OF USE</Text><Text accessibilityRole="header" style={styles.title}>Records and summaries—not financial advice.</Text>
      <Card title="Product limits">Finova is a local record-keeping and visualization tool. It does not connect to a bank, move money, block purchases, forecast outcomes, or provide financial, tax, legal, credit, or investment advice.</Card>
      <Card title="Finova Plus">Finova Plus is a one-time, non-consumable App Store purchase that unlocks the features listed on the plan screen. It does not renew. Apple handles payment and refunds under its policies. Deleting local data or the app does not revoke the purchase; Restore Purchases can recover the unlock for the same Apple account.</Card>
      <Card title="Your responsibility">Enter only data you are allowed to use. Review every entry, calculation, exported file, and backup. Protect your device and anything you export.</Card>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)} style={styles.link}><Text style={styles.linkText}>Open full Terms of Use</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} style={styles.link}><Text style={styles.linkText}>Open Privacy Policy</Text></Pressable>
    </Screen>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.body}>{children}</Text></View>; }
const styles = StyleSheet.create({ body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }, cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' }, eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, link: { justifyContent: 'center', minHeight: 48 }, linkText: { color: colors.jade, fontSize: 15, fontWeight: '800' }, title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 } });
