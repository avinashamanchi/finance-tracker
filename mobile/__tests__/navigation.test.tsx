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
    for (const route of ['(tabs)', 'transaction/new', 'transaction/[id]', 'insights', 'privacy', 'support', 'expected-bills', 'expected-bill/[id]', 'recurring-template/new', 'recurring-template/[id]', 'savings-goals', 'savings-goal/new', 'savings-goal/[id]']) {
      expect(root).toContain(`name="${route}"`);
    }
    const expectedBills = readFileSync(join(__dirname, '../app/expected-bills.tsx'), 'utf8');
    const recurringEditor = readFileSync(join(__dirname, '../app/recurring-template/[id].tsx'), 'utf8');
    expect(expectedBills).not.toMatch(/params:\s*\{[^}]*description/s);
    expect(recurringEditor).toContain('repository.getTemplate(id)');
  });
});
