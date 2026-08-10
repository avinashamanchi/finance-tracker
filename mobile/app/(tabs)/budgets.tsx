import { useRouter } from 'expo-router';
import { BudgetsScreen } from '../../src/screens/BudgetsScreen';
import { useBilling } from '../../src/billing/BillingProvider';

export default function BudgetsRoute() {
  const router = useRouter();
  const billing = useBilling();
  return <BudgetsScreen isPlus={billing.entitlementActive} onUpgrade={() => router.push('/upgrade')} />;
}
