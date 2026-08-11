import { useRouter } from 'expo-router';
import { HomeScreen } from '../../src/screens/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();
  return <HomeScreen onAdd={() => router.push('/transaction/new')} onExpectedBills={() => router.push('/expected-bills' as never)} onInsights={() => router.push('/insights')} onSavingsGoals={() => router.push('/savings-goals' as never)} />;
}
