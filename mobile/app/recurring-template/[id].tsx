import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { useBilling } from '../../src/billing/BillingProvider';
import { Screen } from '../../src/components/Screen';
import { useFinance } from '../../src/data/FinanceProvider';
import { colors } from '../../src/design/tokens';
import type { RecurringTemplate } from '../../src/domain/recurrence';
import { RecurringTemplateEditor } from '../../src/screens/RecurringTemplateEditor';

export default function EditRecurringTemplateRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const finance = useFinance();
  const billing = useBilling();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [initial, setInitial] = useState<RecurringTemplate | null>();
  const repository = finance.recurringRepository;
  useEffect(() => {
    let current = true;
    setInitial(undefined);
    if (!id || !repository) return () => { current = false; };
    void repository.getTemplate(id)
      .then((template) => { if (current) setInitial(template); })
      .catch(() => { if (current) setInitial(null); });
    return () => { current = false; };
  }, [id, repository]);
  if (!id) return <Screen><Text accessibilityRole="alert">This recurring bill link is invalid.</Text></Screen>;
  if (!finance.ledger || !repository || initial === undefined) return <Screen><ActivityIndicator accessibilityLabel="Opening recurring bill editor" color={colors.jade} /></Screen>;
  if (initial === null) return <Screen><Text accessibilityRole="alert">This recurring bill is unavailable.</Text></Screen>;
  return <RecurringTemplateEditor entitlement={billing.status} initial={initial} ledger={finance.ledger} onCancel={() => router.back()} onSaved={() => router.back()} onUpgrade={() => router.push('/upgrade')} repository={repository} />;
}
