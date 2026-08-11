import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useBilling } from '../src/billing/BillingProvider';
import { Screen } from '../src/components/Screen';
import { useFinance } from '../src/data/FinanceProvider';
import { colors } from '../src/design/tokens';
import { ExpectedBillsScreen } from '../src/screens/ExpectedBillsScreen';

export default function ExpectedBillsRoute() {
  const router = useRouter();
  const finance = useFinance();
  const billing = useBilling();
  if (!finance.ledger || !finance.recurringRepository) {
    return <Screen><ActivityIndicator accessibilityLabel="Opening expected bills" color={colors.jade} /></Screen>;
  }
  return (
    <ExpectedBillsScreen
      entitlement={billing.status}
      ledger={finance.ledger}
      onEditTemplate={(bill) => router.push({
        pathname: '/recurring-template/[id]',
        params: { id: bill.template.id },
      } as never)}
      onNewTemplate={() => router.push('/recurring-template/new' as never)}
      onRecord={(bill) => router.push({ pathname: '/expected-bill/[id]', params: { id: bill.id } } as never)}
      onUpgrade={() => router.push('/upgrade')}
      repository={finance.recurringRepository}
    />
  );
}
