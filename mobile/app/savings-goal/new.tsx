import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useBilling } from '../../src/billing/BillingProvider';
import { Screen } from '../../src/components/Screen';
import { useFinance } from '../../src/data/FinanceProvider';
import { colors } from '../../src/design/tokens';
import { SavingsGoalEditor } from '../../src/screens/SavingsGoalEditor';

export default function NewSavingsGoalRoute() {
  const router = useRouter(); const finance = useFinance(); const billing = useBilling();
  if (!finance.ledger || !finance.planningRepository) return <Screen><ActivityIndicator accessibilityLabel="Opening savings goal editor" color={colors.jade} /></Screen>;
  return <SavingsGoalEditor entitlement={billing.status} ledger={finance.ledger} onCancel={() => router.back()} onSaved={() => router.back()} onUpgrade={() => router.push('/upgrade')} repository={finance.planningRepository} />;
}
