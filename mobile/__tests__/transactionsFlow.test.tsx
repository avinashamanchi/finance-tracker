import { fireEvent, waitFor } from '@testing-library/react-native';
import { TransactionEditor } from '../src/screens/TransactionEditor';
import { TransactionsScreen } from '../src/screens/TransactionsScreen';
import { renderWithFinance } from '../test-utils/renderWithFinance';

describe('transaction flows', () => {
  it('validates and saves a new expense in integer minor units', async () => {
    const onSaved = jest.fn();
    const view = await renderWithFinance(<TransactionEditor onSaved={onSaved} onCancel={jest.fn()} />);
    await waitFor(() => expect(view.getByLabelText('Amount')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Amount'), '42.15');
    await fireEvent.changeText(view.getByLabelText('Description'), 'Groceries');
    await fireEvent.changeText(view.getByLabelText('Date YYYY-MM-DD'), '2026-08-06');
    await fireEvent.press(view.getByLabelText('Groceries category'));
    await fireEvent.press(view.getByLabelText('Save transaction'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const ledger = await view.repository.getLedger();
    expect((await view.repository.listTransactionsPage({
      ledgerId: ledger.id, limit: 50, kinds: [], search: '',
    })).items[0]).toMatchObject({ amountMinor: 4_215, description: 'Groceries' });
  });

  it('keeps input and shows inline errors for invalid values', async () => {
    const view = await renderWithFinance(<TransactionEditor onSaved={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(view.getByLabelText('Amount')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Amount'), '1.999');
    await fireEvent.press(view.getByLabelText('Save transaction'));
    expect(view.getByText(/up to 2 decimal places/i)).toBeTruthy();
    expect(view.getByText('Add a description between 1 and 120 characters.')).toBeTruthy();
    expect(view.getByLabelText('Amount').props.value).toBe('1.999');
  });

  it('distinguishes a filtered-empty list from an empty ledger', async () => {
    const view = await renderWithFinance(<TransactionsScreen onAdd={jest.fn()} onEdit={jest.fn()} />, {
      transactions: [{
        id: 'one', kind: 'expense', amountMinor: 100, categoryId: 'dining', description: 'Coffee',
        occurredOn: '2026-08-06', isRecurring: false,
        createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z',
      }],
      budgets: [],
    });
    await waitFor(() => expect(view.getByText('Coffee')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Search transactions'), 'rent');
    await waitFor(() => expect(view.getByText('No matching transactions')).toBeTruthy());
  });

  it('exposes accessible bounded older and newer page controls', async () => {
    const view = await renderWithFinance(
      <TransactionsScreen onAdd={jest.fn()} onEdit={jest.fn()} />,
      {
        transactions: Array.from({ length: 51 }, (_, index) => ({
          id: `row-${index}`, kind: 'expense' as const, amountMinor: index + 1,
          categoryId: 'dining' as const, description: `Coffee ${index}`,
          occurredOn: '2026-08-06', isRecurring: false,
          createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z',
        })),
        budgets: [],
      },
    );
    await waitFor(() => expect(view.getByLabelText('Load older transactions').props.accessibilityState)
      .toEqual({ disabled: false }));
    expect(view.getByLabelText('Load newer transactions').props.accessibilityState)
      .toEqual({ disabled: true });
    await fireEvent.press(view.getByLabelText('Load older transactions'));
    await waitFor(() => expect(view.getByText('51 loaded on this device')).toBeTruthy());
  });
});
