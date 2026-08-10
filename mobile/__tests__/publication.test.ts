import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function pngHeader(path: string) {
  const value = readFileSync(path);
  expect(value.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return {
    width: value.readUInt32BE(16),
    height: value.readUInt32BE(20),
    colorType: value.readUInt8(25),
  };
}

describe('iOS publication package', () => {
  it('uses an opaque 1024-square icon and explicit credential-free identity', () => {
    expect(pngHeader(join(__dirname, '../assets/icon.png'))).toEqual({ width: 1024, height: 1024, colorType: 2 });
    const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')).expo;
    expect(app.ios.bundleIdentifier).toBe('com.avinashamanchi.finova');
    expect(app.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(JSON.stringify(app)).not.toMatch(/NS(?:Camera|Photo|Location|Microphone|Contacts|Health)/);
  });

  it('keeps metadata within App Store limits and avoids unsupported claims', () => {
    const metadata = JSON.parse(readFileSync(join(ROOT, 'docs/app-store/metadata-draft.json'), 'utf8'));
    expect(metadata.name.length).toBeLessThanOrEqual(30);
    expect(metadata.subtitle.length).toBeLessThanOrEqual(30);
    expect(metadata.promotionalText.length).toBeLessThanOrEqual(170);
    expect(metadata.description.length).toBeLessThanOrEqual(4_000);
    expect(Buffer.byteLength(metadata.keywords)).toBeLessThanOrEqual(100);
    expect(metadata.keywords).not.toContain(' ');
    const copy = `${metadata.promotionalText} ${metadata.description}`.toLowerCase();
    for (const claim of ['bank-grade', 'financial advice', 'tax advice', 'guaranteed', 'connect your bank']) expect(copy).not.toContain(claim);
    for (const disclosure of ['stored locally', 'not financial, tax, legal, credit, or investment advice', 'may be incomplete']) expect(copy).toContain(disclosure);
    expect(metadata.submissionStatus).toBe('BLOCKED');
    expect(metadata.primaryLanguage).toBe('English (U.S.)');
    expect(metadata.sku).toBe('finova-ios');
    expect(metadata.appPrivacyDraft).toMatchObject({
      tracking: false,
      purchaseHistory: expect.stringMatching(/RevenueCat.*not linked/i),
    });
    expect(metadata.appPrivacyDraft).not.toHaveProperty('userId');
  });

  it('documents current screenshot canvases and leaves external gates unchecked', () => {
    const matrix = readFileSync(join(ROOT, 'docs/app-store/screenshot-matrix.md'), 'utf8');
    expect(matrix).toMatch(/1320×2868|1290×2796|1260×2736/);
    expect(matrix).toContain('1–10');
    const checklist = readFileSync(join(ROOT, 'docs/app-store/finova-ios-release-checklist.md'), 'utf8');
    for (const gate of ['physical iPhone', 'VoiceOver', 'TestFlight', 'App Review', 'public App Store listing']) expect(checklist).toContain(gate);
    expect(checklist).toContain('No App Store acceptance or publication is claimed');
  });

  it('uses gated CI and a manual no-submit release workflow', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ios-ci.yml'), 'utf8');
    const release = readFileSync(join(ROOT, '.github/workflows/release-readiness.yml'), 'utf8');
    for (const command of ['npm ci', 'npm test -- --runInBand', 'npm run typecheck', 'npm run lint', 'npm run expo:doctor', 'npm run export:ios', 'node scripts/check-mobile-audit.mjs', 'scan-secrets.mjs']) {
      expect(`${ci}\n${release}`).toContain(command);
    }
    expect(release).toContain('workflow_dispatch');
    expect(release).toContain('expo prebuild --platform ios --no-install --clean');
    expect(release).toContain('git diff --exit-code -- package.json package-lock.json');
    expect(release).not.toMatch(/eas submit|eas build|appleId|ascApiKey|fastlane deliver/i);
    const auditGate = readFileSync(join(ROOT, 'scripts/check-mobile-audit.mjs'), 'utf8');
    expect(auditGate).toContain('1138808');
    expect(auditGate).toContain('1138809');
    expect(auditGate).toContain('--audit-level=high');
    expect(auditGate).toContain('report.error');
  });

  it('ships a safe static landing page plus public legal documents', () => {
    for (const file of ['index.html', 'privacy.html', 'support.html', 'terms.html']) {
      expect(readFileSync(join(ROOT, 'public', file), 'utf8')).toContain('Finova');
    }
    const landing = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
    expect(landing).toMatch(/Finova for iPhone/i);
    expect(landing).toMatch(/privacy\.html/);
    expect(landing).toMatch(/terms\.html/);
    expect(landing).toMatch(/support\.html/);
    expect(landing).not.toMatch(/<script|<form|localStorage|password/i);
    const privacy = readFileSync(join(ROOT, 'public/privacy.html'), 'utf8');
    expect(privacy).toMatch(/Apple processes.*payment/i);
    expect(privacy).toMatch(/RevenueCat.*purchase/i);
    expect(privacy).toMatch(/payment-card details/i);
  });
});
