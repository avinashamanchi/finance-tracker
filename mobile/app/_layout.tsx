import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteFinanceProvider } from '../src/data/FinanceProvider';
import { colors } from '../src/design/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SQLiteFinanceProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ contentStyle: { backgroundColor: colors.ink }, headerStyle: { backgroundColor: colors.inkRaised }, headerTintColor: colors.text, headerShadowVisible: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="transaction/new" options={{ presentation: 'modal', title: 'New transaction' }} />
            <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'Edit transaction' }} />
            <Stack.Screen name="insights" options={{ title: 'Insights' }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
            <Stack.Screen name="support" options={{ title: 'Support' }} />
          </Stack>
        </SQLiteFinanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
