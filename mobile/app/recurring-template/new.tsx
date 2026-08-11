import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useBilling } from '../../src/billing/BillingProvider';
import { Screen } from '../../src/components/Screen';
import { useFinance } from '../../src/data/FinanceProvider';
import { colors } from '../../src/design/tokens';
import { RecurringTemplateEditor } from '../../src/screens/RecurringTemplateEditor';

export default function NewRecurringTemplateRoute() {
  const router = useRouter();
  const finance = useFinance();
  const billing = useBilling();
  if (!finance.ledger || !finance.recurringRepository) return <Screen><ActivityIndicator accessibilityLabel="Opening recurring bill editor" color={colors.jade} /></Screen>;
  return <RecurringTemplateEditor entitlement={billing.status} ledger={finance.ledger} onCancel={() => router.back()} onSaved={() => router.back()} onUpgrade={() => router.push('/upgrade')} repository={finance.recurringRepository} />;
}
