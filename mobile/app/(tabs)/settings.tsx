import { useRouter } from 'expo-router';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

export default function SettingsRoute() {
  const router = useRouter();
  return <SettingsScreen onPrivacy={() => router.push('/privacy')} onSupport={() => router.push('/support')} />;
}
