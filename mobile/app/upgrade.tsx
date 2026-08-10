import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBilling } from '../src/billing/BillingProvider';
import { Screen } from '../src/components/Screen';
import { colors, radius, spacing } from '../src/design/tokens';
import { PRIVACY_URL, TERMS_URL } from '../src/legal/links';

export default function UpgradeScreen() {
  const router = useRouter();
  const billing = useBilling();
  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>FINOVA PLANS</Text><Text accessibilityRole="header" style={styles.title}>Keep the ledger free. Own the deeper tools.</Text><Text style={styles.subtitle}>Finova Plus is a one-time unlock, not a subscription. Continue with Free whenever you want.</Text></View>
      <View style={styles.card}><Text style={styles.cardTitle}>Free</Text><Text style={styles.body}>Unlimited local transactions</Text><Text style={styles.body}>Up to 3 active budgets</Text><Text style={styles.body}>Monthly dashboard and password-encrypted backup</Text></View>
      <View style={[styles.card, styles.plus]}><Text style={styles.plusTitle}>Finova Plus</Text><Text style={styles.body}>Unlimited budgets with optional rollover</Text><Text style={styles.body}>Six-month insights and CSV export</Text><Text style={styles.body}>Expected bills with confirm-before-record</Text><Text style={styles.body}>Savings-goal planning that never moves money</Text></View>
      {billing.entitlementActive ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.noticeText}>Finova Plus is active on this Apple account.</Text></View> : null}
      {billing.availability === 'preview' ? <View style={styles.notice}><Text style={styles.noticeText}>Expo Go can preview this screen, but Apple purchases require the signed App Store development build. No payment can be made here.</Text></View> : null}
      {billing.availability === 'configuration' ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.body}>App Store purchases are not configured in this build. Free remains available.</Text></View> : null}
      {billing.availability === 'error' ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.body}>The App Store could not load purchase options. Try again later.</Text><Action label="Reload purchase options" onPress={() => void billing.reload()} disabled={billing.busy} /></View> : null}
      {billing.availability === 'ready' && !billing.entitlementActive ? billing.products.map(product => (
        <View style={styles.card} key={product.id}>
          <Text style={styles.cardTitle}>{product.title}</Text><Text style={styles.price}>{product.price} one time</Text><Text style={styles.body}>{product.description}</Text>
          <Action accessibilityLabel={`Unlock Finova Plus for ${product.price} one time`} label={`Unlock for ${product.price}`} onPress={() => void billing.purchase(product.id)} disabled={billing.busy} />
        </View>
      )) : null}
      {billing.message ? <Text accessibilityRole="alert" style={styles.status}>{billing.message}</Text> : null}
      <Action label="Continue with Free" onPress={() => router.back()} disabled={billing.busy} quiet />
      <Action
        label="Restore Purchases"
        onPress={() => void billing.restore()}
        disabled={billing.busy || ['loading', 'preview', 'configuration'].includes(billing.availability)}
      />
      <Text style={styles.caption}>Apple charges the displayed one-time price at confirmation. This purchase does not renew.</Text>
      <View style={styles.links}>
        <Pressable accessibilityLabel="Privacy Policy" accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} style={styles.link}><Text style={styles.linkText}>Privacy Policy</Text></Pressable>
        <Pressable accessibilityLabel="Terms of Use" accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)} style={styles.link}><Text style={styles.linkText}>Terms of Use</Text></Pressable>
      </View>
    </Screen>
  );
}
function Action({ label, accessibilityLabel, onPress, disabled = false, quiet = false }: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <Pressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, quiet && styles.quiet, disabled && styles.disabled]}><Text style={[styles.buttonText, quiet && styles.quietText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, button: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.sm, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.md }, buttonText: { color: colors.ink, fontSize: 15, fontWeight: '900' }, caption: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg }, cardTitle: { color: colors.text, fontSize: 20, fontWeight: '900' }, disabled: { opacity: 0.45 }, eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, header: { gap: spacing.xs }, link: { justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.sm }, links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }, linkText: { color: colors.jade, fontSize: 14, fontWeight: '800' }, notice: { backgroundColor: colors.jadeDark, borderColor: colors.jade, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md }, noticeText: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 21 }, plus: { borderColor: colors.jade }, plusTitle: { color: colors.jade, fontSize: 20, fontWeight: '900' }, price: { color: colors.text, fontSize: 25, fontWeight: '900' }, quiet: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 }, quietText: { color: colors.text }, status: { color: colors.jade, fontSize: 14, lineHeight: 20 }, subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 }, title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
});
