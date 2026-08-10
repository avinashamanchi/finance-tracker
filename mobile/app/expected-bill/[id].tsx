import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { useFinance } from '../../src/data/FinanceProvider';
import { colors } from '../../src/design/tokens';
import { ExpectedBillRecordScreen } from '../../src/screens/ExpectedBillRecordScreen';

export default function ExpectedBillRecordRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const finance = useFinance();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id || !finance.ledger || !finance.recurringRepository) return <Screen><ActivityIndicator accessibilityLabel="Opening expected bill review" color={colors.jade} /></Screen>;
  return <ExpectedBillRecordScreen ledger={finance.ledger} occurrenceId={id} onCancel={() => router.back()} onRecorded={async () => { await finance.refreshAfterDataReplacement(); router.back(); }} repository={finance.recurringRepository} />;
}
