import dynamicAppConfig from '../app.config';
import appConfig from '../app.json';
import easConfig from '../eas.json';

describe('release configuration', () => {
  it('has an explicit iOS identity and no over-the-air update drift', () => {
    expect(appConfig.expo.name).toBe('Finova');
    expect(appConfig.expo.ios.bundleIdentifier).toBe('com.avinashamanchi.finova');
    expect(appConfig.expo.ios.buildNumber).toBe('1');
    expect(appConfig.expo.updates).toEqual({ enabled: false });
    expect(appConfig.expo.ios.usesAppleSignIn).toBe(false);
    expect(appConfig.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('fails closed when a production build lacks a real public RevenueCat Apple key', () => {
    const originalProfile = process.env.EAS_BUILD_PROFILE;
    const originalKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    try {
      process.env.EAS_BUILD_PROFILE = 'production';
      delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
      expect(() => dynamicAppConfig({ config: appConfig.expo } as never))
        .toThrow('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_replace_with_revenuecat_public_sdk_key';
      expect(() => dynamicAppConfig({ config: appConfig.expo } as never))
        .toThrow('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_AbCdEfGhIjKlMnOp';
      expect(dynamicAppConfig({ config: appConfig.expo } as never)).toEqual(appConfig.expo);
    } finally {
      if (originalProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
      else process.env.EAS_BUILD_PROFILE = originalProfile;
      if (originalKey === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
      else process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = originalKey;
    }
  });

  it('requires a clean commit and contains no submission credentials', () => {
    expect(easConfig.cli).toMatchObject({ appVersionSource: 'remote', requireCommit: true });
    expect(easConfig.build.production).toEqual({
      distribution: 'store',
      autoIncrement: true,
      ios: { image: 'auto' },
    });
    expect(easConfig).not.toHaveProperty('submit');
    expect(JSON.stringify(easConfig)).not.toMatch(/appleId|ascApiKey|password/i);
  });
});
