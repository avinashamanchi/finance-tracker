import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const guard = path.join(root, 'legacy-web/scripts/require-explicit-unsafe-opt-in.mjs');
const expectedError = 'Blocked: this unsupported legacy demo stores plaintext passwords in browser storage.\n';

it('keeps the unsafe browser login outside supported build and deploy paths', () => {
  for (const unsupportedRootEntrypoint of ['src', 'public/index.html', 'package.json', 'package-lock.json']) {
    expect(fs.existsSync(path.join(root, unsupportedRootEntrypoint))).toBe(false);
  }

  const legacyPackage = JSON.parse(fs.readFileSync(path.join(root, 'legacy-web/package.json'), 'utf8'));
  const legacyLock = JSON.parse(fs.readFileSync(path.join(root, 'legacy-web/package-lock.json'), 'utf8'));
  expect(legacyPackage.scripts.deploy).toBeUndefined();
  expect(legacyPackage.scripts.predeploy).toBeUndefined();
  expect(legacyPackage.scripts.build).toBeUndefined();
  expect(legacyPackage.homepage).toBeUndefined();
  expect(legacyPackage.devDependencies?.['gh-pages']).toBeUndefined();
  expect(legacyLock.packages?.['node_modules/gh-pages']).toBeUndefined();
  expect(legacyPackage.scripts.prestart).toBeUndefined();
  expect(legacyPackage.scripts.start).toBe('node scripts/require-explicit-unsafe-opt-in.mjs && react-scripts start');
  expect(legacyPackage.scripts['build:unsupported-local-only']).toBe('node scripts/require-explicit-unsafe-opt-in.mjs && react-scripts build');

  for (const workflow of fs.readdirSync(path.join(root, '.github/workflows')).filter(name => /\.ya?ml$/i.test(name))) {
    const text = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    expect(text).not.toMatch(/legacy-web|react-scripts|gh-pages/);
  }
});

it.each([
  ['an explicitly unset variable', undefined],
  ['an empty value', ''],
  ['a representative wrong value', 'wrong'],
  ['a near-miss value', 'I_UNDERSTAND_PLAINTEXT_PASSWORD_STORAG'],
])('blocks the unsafe legacy scripts for %s', (_caseName, value) => {
  const env = { ...process.env };
  delete env.FINOVA_ALLOW_UNSAFE_LEGACY_WEB;
  if (value !== undefined) env.FINOVA_ALLOW_UNSAFE_LEGACY_WEB = value;

  const result = spawnSync(process.execPath, [guard], { cwd: root, env, encoding: 'utf8' });

  expect(result.status).toBe(1);
  expect(result.stderr).toBe(expectedError);
  expect(result.stdout).toBe('');
});

it('allows only the exact explicit unsafe legacy opt-in', () => {
  const result = spawnSync(process.execPath, [guard], {
    cwd: root,
    env: {
      ...process.env,
      FINOVA_ALLOW_UNSAFE_LEGACY_WEB: 'I_UNDERSTAND_PLAINTEXT_PASSWORD_STORAGE',
    },
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe('');
});
