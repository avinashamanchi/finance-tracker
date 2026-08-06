import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Maestro acceptance flow', () => {
  it('uses semantic production controls and never claims share delivery', () => {
    const flow = readFileSync(join(__dirname, '../e2e/ios-core-flow.yaml'), 'utf8');
    for (const id of [
      'home-add', 'transaction-amount', 'transaction-description', 'transaction-date',
      'category-groceries', 'transaction-save', 'tab-budgets', 'budget-groceries-amount',
      'budget-groceries-save', 'tab-settings', 'settings-export-csv', 'settings-delete-confirmation',
      'settings-delete-all',
    ]) {
      expect(flow).toContain(`id: ${id}`);
    }
    expect(flow).not.toMatch(/share (?:complete|delivered|successful)/i);

    const source = [
      '../src/screens/HomeScreen.tsx', '../src/screens/TransactionEditor.tsx',
      '../src/components/BudgetRow.tsx', '../src/screens/SettingsScreen.tsx', '../app/(tabs)/_layout.tsx',
    ].map((path) => readFileSync(join(__dirname, path), 'utf8')).join('\n');
    for (const id of ['home-add', 'transaction-amount', 'settings-export-csv', 'settings-delete-all']) {
      expect(source).toContain(`testID="${id}"`);
    }
  });
});
