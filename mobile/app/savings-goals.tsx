import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useBilling } from '../src/billing/BillingProvider';
import { Screen } from '../src/components/Screen';
import { useFinance } from '../src/data/FinanceProvider';
import { colors } from '../src/design/tokens';
import { SavingsGoalsScreen } from '../src/screens/SavingsGoalsScreen';

export default function SavingsGoalsRoute() {
  const router = useRouter();
  const finance = useFinance();
  const billing = useBilling();
  if (!finance.ledger || !finance.planningRepository) return <Screen><ActivityIndicator accessibilityLabel="Opening savings goals" color={colors.jade} /></Screen>;
  return <SavingsGoalsScreen entitlement={billing.status} ledger={finance.ledger} onNew={() => router.push('/savings-goal/new' as never)} onOpen={(goal) => router.push({ pathname: '/savings-goal/[id]', params: { id: goal.id } } as never)} onUpgrade={() => router.push('/upgrade')} repository={finance.planningRepository} />;
}
