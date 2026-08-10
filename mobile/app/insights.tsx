import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBilling } from '../src/billing/BillingProvider';
import { Screen } from '../src/components/Screen';
import { colors, radius, spacing } from '../src/design/tokens';
import { InsightsScreen } from '../src/screens/InsightsScreen';

export default function InsightsRoute() {
  const router = useRouter();
  const billing = useBilling();
  if (billing.entitlementActive) return <InsightsScreen />;
  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>FINOVA PLUS</Text>
        <Text accessibilityRole="header" style={styles.title}>Six-month insights are in Finova Plus.</Text>
        <Text style={styles.body}>Monthly totals and your local ledger remain free. Plus adds a six-month deterministic comparison without forecasts or financial recommendations.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/upgrade')} style={styles.button}><Text style={styles.buttonText}>View Finova Plus</Text></Pressable>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 }, button: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.sm, justifyContent: 'center', minHeight: 50 }, buttonText: { color: colors.ink, fontSize: 15, fontWeight: '900' }, card: { backgroundColor: colors.panel, borderColor: colors.jade, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg }, eyebrow: { color: colors.jade, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
});
