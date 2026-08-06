import appConfig from '../app.json';
import easConfig from '../eas.json';

describe('release configuration', () => {
  it('has an explicit iOS identity and no over-the-air update drift', () => {
    expect(appConfig.expo.name).toBe('Finova');
    expect(appConfig.expo.ios.bundleIdentifier).toBe('com.avinashamanchi.finova');
    expect(appConfig.expo.ios.buildNumber).toBe('1');
    expect(appConfig.expo.updates).toEqual({ enabled: false });
    expect(appConfig.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('requires a clean commit and contains no submission credentials', () => {
    expect(easConfig.cli.requireCommit).toBe(true);
    expect(easConfig.build.production).toEqual({
      distribution: 'store',
      autoIncrement: false,
    });
    expect(easConfig).not.toHaveProperty('submit');
    expect(JSON.stringify(easConfig)).not.toMatch(/appleId|ascApiKey|password/i);
  });
});
