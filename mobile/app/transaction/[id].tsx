import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useFinance } from '../../src/data/FinanceProvider';
import type { Transaction } from '../../src/domain/types';
import { TransactionEditor } from '../../src/screens/TransactionEditor';

export default function EditTransactionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { transactions, getTransactionById } = useFinance();
  const visible = transactions.find((item) => item.id === id);
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(visible);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) {
      setTransaction(visible);
      setFailed(false);
      return;
    }
    let active = true;
    setTransaction(undefined);
    setFailed(false);
    void getTransactionById(id)
      .then((value) => { if (active) setTransaction(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [getTransactionById, id, visible]);

  if (failed) return <Text accessibilityRole="alert">Finova could not safely load this transaction.</Text>;
  if (transaction === undefined) return <ActivityIndicator accessibilityLabel="Loading transaction" />;
  if (transaction === null) return <Redirect href="/(tabs)/transactions" />;
  return <TransactionEditor onCancel={() => router.back()} onSaved={() => router.back()} transaction={transaction} />;
}
