import { waitFor } from '@testing-library/react-native';
import { HomeScreen } from '../src/screens/HomeScreen';
import type { FinanceSnapshot } from '../src/domain/types';
import { renderWithFinance } from '../test-utils/renderWithFinance';

const snapshot: FinanceSnapshot = {
  transactions: [
    {
      id: 'income', kind: 'income', amountCents: 100_000, categoryId: 'salary',
      description: 'Paycheck', occurredOn: '2026-08-01', isRecurring: true,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'expense', kind: 'expense', amountCents: 25_000, categoryId: 'groceries',
      description: 'Market', occurredOn: '2026-08-02', isRecurring: false,
      createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
    },
  ],
  budgets: [{ categoryId: 'groceries', limitCents: 30_000, updatedAt: '2026-08-01T00:00:00.000Z' }],
};

describe('HomeScreen', () => {
  it('shows deterministic monthly totals and a text budget warning', async () => {
    const view = await renderWithFinance(
      <HomeScreen initialMonth="2026-08" onAdd={jest.fn()} onInsights={jest.fn()} />,
      snapshot,
    );
    await waitFor(() => expect(view.getByText('$750.00')).toBeTruthy());
    expect(view.getAllByText('$1,000.00').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('$250.00')).toBeTruthy();
    expect(view.getByText(/83% used/)).toBeTruthy();
    expect(view.getByLabelText('Add transaction')).toBeTruthy();
  });

  it('distinguishes an empty ledger and exposes its add action', async () => {
    const view = await renderWithFinance(
      <HomeScreen initialMonth="2026-08" onAdd={jest.fn()} onInsights={jest.fn()} />,
    );
    await waitFor(() => expect(view.getByText('Your month starts here')).toBeTruthy());
    expect(view.getByLabelText('Add first transaction')).toBeTruthy();
  });
});
