import { useRouter } from 'expo-router';
import { BudgetsScreen } from '../../src/screens/BudgetsScreen';
import { useBilling } from '../../src/billing/BillingProvider';
import { useFinance } from '../../src/data/FinanceProvider';

export default function BudgetsRoute() {
  const router = useRouter();
  const billing = useBilling();
  const finance = useFinance();
  return <BudgetsScreen isPlus={billing.entitlementActive} onUpgrade={() => router.push('/upgrade')} planningRepository={finance.planningRepository} />;
}
