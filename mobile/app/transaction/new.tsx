import { useRouter } from 'expo-router';
import { TransactionEditor } from '../../src/screens/TransactionEditor';

export default function NewTransactionRoute() {
  const router = useRouter();
  return <TransactionEditor onCancel={() => router.back()} onSaved={() => router.back()} />;
}
