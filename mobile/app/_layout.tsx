import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteFinanceProvider } from '../src/data/FinanceProvider';
import { BillingProvider } from '../src/billing/BillingProvider';
import { colors } from '../src/design/tokens';
import { ArtifactStore } from '../src/services/artifacts';

function ArtifactCleanupGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<'cleaning' | 'ready' | 'error'>('cleaning');
  const clean = useCallback(() => {
    setState('cleaning');
    void new ArtifactStore().cleanupAll()
      .then(() => setState('ready'))
      .catch(() => setState('error'));
  }, []);
  useEffect(clean, [clean]);
  if (state === 'ready') return children;
  return (
    <View accessibilityLiveRegion="polite" style={styles.cleanup}>
      {state === 'cleaning' ? <ActivityIndicator color={colors.jade} /> : null}
      <Text style={styles.cleanupTitle}>
        {state === 'cleaning' ? 'Preparing private files…' : 'Private file cleanup needs another try.'}
      </Text>
      {state === 'error' ? (
        <Pressable accessibilityRole="button" onPress={clean} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ArtifactCleanupGate>
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
        </ArtifactCleanupGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  cleanup: { alignItems: 'center', backgroundColor: colors.ink, flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  cleanupTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  retry: { backgroundColor: colors.jade, borderRadius: 12, minWidth: 140, paddingHorizontal: 18, paddingVertical: 14 },
  retryText: { color: colors.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
});
