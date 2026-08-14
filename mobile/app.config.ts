import type { ConfigContext, ExpoConfig } from 'expo/config';

const PUBLIC_REVENUECAT_KEY = /^appl_[A-Za-z0-9_-]{12,}$/;

function isRevenueCatApplePublicKey(value: string): boolean {
  return PUBLIC_REVENUECAT_KEY.test(value)
    && !/(?:example|placeholder|replace|your|test)/i.test(value);
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    const revenueCatKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? '';
    if (
      !isRevenueCatApplePublicKey(revenueCatKey)
    ) {
      throw new Error('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is required for the production build');
    }
  }
  return config as ExpoConfig;
}
