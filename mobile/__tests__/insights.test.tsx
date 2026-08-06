import { waitFor } from '@testing-library/react-native';
import { InsightsScreen } from '../src/screens/InsightsScreen';
import { renderWithFinance } from '../test-utils/renderWithFinance';

describe('InsightsScreen', () => {
  it('renders six accessible monthly summaries including empty months', async () => {
    const view = await renderWithFinance(<InsightsScreen anchorMonth="2026-08" />, {
      transactions: [{
        id: 'one', kind: 'income', amountCents: 50_000, categoryId: 'salary', description: 'Pay',
        occurredOn: '2026-08-01', isRecurring: true,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      budgets: [],
    });
    await waitFor(() => expect(view.getAllByLabelText(/Income .* expenses .* balance/)).toHaveLength(6));
    expect(view.getByText('Six-month view')).toBeTruthy();
  });
});
