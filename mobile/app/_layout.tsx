import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteFinanceProvider } from '../src/data/FinanceProvider';
import { BillingProvider } from '../src/billing/BillingProvider';
import { colors } from '../src/design/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BillingProvider>
          <SQLiteFinanceProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ contentStyle: { backgroundColor: colors.ink }, headerStyle: { backgroundColor: colors.inkRaised }, headerTintColor: colors.text, headerShadowVisible: false }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="transaction/new" options={{ presentation: 'modal', title: 'New transaction' }} />
              <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'Edit transaction' }} />
              <Stack.Screen name="insights" options={{ title: 'Insights' }} />
              <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
              <Stack.Screen name="support" options={{ title: 'Support' }} />
              <Stack.Screen name="terms" options={{ title: 'Terms of Use' }} />
              <Stack.Screen name="upgrade" options={{ title: 'Finova Plus' }} />
            </Stack>
          </SQLiteFinanceProvider>
        </BillingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
