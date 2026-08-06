import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '../../src/design/tokens';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.jade, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { backgroundColor: colors.inkRaised, borderTopColor: colors.border, height: 86, paddingTop: 7 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="home-outline" size={size} /> }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="receipt-outline" size={size} /> }} />
      <Tabs.Screen name="budgets" options={{ title: 'Budgets', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="speedometer-outline" size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="settings-outline" size={size} /> }} />
    </Tabs>
  );
}
