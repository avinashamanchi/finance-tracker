import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('native navigation structure', () => {
  it('defines four compact tabs and stack routes for focused flows', () => {
    const tabs = readFileSync(join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8');
    for (const title of ['Home', 'Transactions', 'Budgets', 'Settings']) {
      expect(tabs).toContain(`title: '${title}'`);
    }
    expect(tabs.match(/Tabs\.Screen/g)).toHaveLength(4);

    const root = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
    for (const route of ['(tabs)', 'transaction/new', 'transaction/[id]', 'insights', 'privacy', 'support']) {
      expect(root).toContain(`name="${route}"`);
    }
  });
});
