import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { BudgetsScreen } from '../src/screens/BudgetsScreen';
import { renderWithFinance } from '../test-utils/renderWithFinance';

describe('budget flows', () => {
  it('sets and clears a monthly category limit', async () => {
    const view = await renderWithFinance(<BudgetsScreen />);
    await waitFor(() => expect(view.getByLabelText('Groceries budget amount')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Groceries budget amount'), '400');
    await fireEvent.press(view.getByLabelText('Save Groceries budget'));
    await waitFor(async () => expect(await view.repository.listBudgets()).toHaveLength(1));
    expect((await view.repository.listBudgets())[0].limitMinor).toBe(40_000);

    await fireEvent.changeText(view.getByLabelText('Groceries budget amount'), '0');
    await fireEvent.press(view.getByLabelText('Save Groceries budget'));
    await waitFor(async () => expect(await view.repository.listBudgets()).toEqual([]));
  });

  it('describes progress without relying only on color', async () => {
    const view = await renderWithFinance(<BudgetsScreen initialMonth="2026-08" />, {
      transactions: [{
        id: 'one', kind: 'expense', amountMinor: 8_500, categoryId: 'dining', description: 'Meals',
        occurredOn: '2026-08-01', isRecurring: false,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      budgets: [{ categoryId: 'dining', limitMinor: 10_000, updatedAt: '2026-08-01T00:00:00.000Z' }],
    });
    await waitFor(() => expect(view.getByText('Near limit — 85% used')).toBeTruthy());
  });

  it('keeps a fourth active budget behind Finova Plus without changing the ledger', async () => {
    const onUpgrade = jest.fn();
    const view = await renderWithFinance(
      <BudgetsScreen onUpgrade={onUpgrade} />,
      { transactions: [], budgets: [
        { categoryId: 'housing', limitMinor: 100_000, updatedAt: '2026-08-01T00:00:00.000Z' },
        { categoryId: 'utilities', limitMinor: 20_000, updatedAt: '2026-08-01T00:00:00.000Z' },
        { categoryId: 'groceries', limitMinor: 40_000, updatedAt: '2026-08-01T00:00:00.000Z' },
      ] },
    );

    await waitFor(() => expect(view.getByText('$1,600.00')).toBeTruthy());
    await act(async () => { fireEvent.changeText(view.getByLabelText('Dining budget amount'), '250'); });
    await act(async () => { fireEvent.press(view.getByLabelText('Save Dining budget')); });

    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(await view.repository.listBudgets()).toHaveLength(3);
  });
});
