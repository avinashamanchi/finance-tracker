import { useRouter } from 'expo-router';
import { useBilling } from '../../src/billing/BillingProvider';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

export default function SettingsRoute() {
  const router = useRouter();
  const billing = useBilling();
  return (
    <SettingsScreen
      isPlus={billing.entitlementActive}
      onPlans={() => router.push('/upgrade')}
      onExpectedBills={() => router.push('/expected-bills' as never)}
      onPrivacy={() => router.push('/privacy')}
      onSupport={() => router.push('/support')}
      onTerms={() => router.push('/terms')}
      onSavingsGoals={() => router.push('/savings-goals' as never)}
    />
  );
}
