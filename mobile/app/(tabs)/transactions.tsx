import { useRouter } from 'expo-router';
import { TransactionsScreen } from '../../src/screens/TransactionsScreen';

export default function TransactionsRoute() {
  const router = useRouter();
  return <TransactionsScreen onAdd={() => router.push('/transaction/new')} onEdit={(id) => router.push(`/transaction/${id}`)} />;
}
