import { useRouter } from 'expo-router';
import { HomeScreen } from '../../src/screens/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();
  return <HomeScreen onAdd={() => router.push('/transaction/new')} onInsights={() => router.push('/insights')} />;
}
