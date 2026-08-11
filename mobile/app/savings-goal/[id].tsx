import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useBilling } from '../../src/billing/BillingProvider';
import { Screen } from '../../src/components/Screen';
import { useFinance } from '../../src/data/FinanceProvider';
import { colors } from '../../src/design/tokens';
import { SavingsGoalDetailScreen } from '../../src/screens/SavingsGoalDetailScreen';

export default function SavingsGoalDetailRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>(); const router = useRouter(); const finance = useFinance(); const billing = useBilling();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id || !finance.ledger || !finance.planningRepository) return <Screen><ActivityIndicator accessibilityLabel="Opening savings goal" color={colors.jade} /></Screen>;
  return <SavingsGoalDetailScreen entitlement={billing.status} goalId={id} ledger={finance.ledger} onDone={() => router.back()} onUpgrade={() => router.push('/upgrade')} repository={finance.planningRepository} />;
}
