import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useFinance } from '../../src/data/FinanceProvider';
import { TransactionEditor } from '../../src/screens/TransactionEditor';

export default function EditTransactionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transaction = useFinance().transactions.find((item) => item.id === id);
  if (!transaction) return <Redirect href="/(tabs)/transactions" />;
  return <TransactionEditor onCancel={() => router.back()} onSaved={() => router.back()} transaction={transaction} />;
}
