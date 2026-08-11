import { render, waitFor } from '@testing-library/react-native';
import EditTransactionRoute from '../app/transaction/[id]';

const mockGetTransactionById = jest.fn();

jest.mock('../src/data/FinanceProvider', () => ({
  useFinance: () => ({
    transactions: [],
    getTransactionById: mockGetTransactionById,
  }),
}));

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`Redirect ${href}`}</Text>,
    useLocalSearchParams: () => ({ id: 'evicted-row' }),
    useRouter: () => ({ back: jest.fn() }),
  };
});

jest.mock('../src/screens/TransactionEditor', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TransactionEditor: ({ transaction }: { transaction: { description: string } }) => (
      <Text>{`Editing ${transaction.description}`}</Text>
    ),
  };
});

describe('edit transaction route', () => {
  beforeEach(() => {
    mockGetTransactionById.mockReset();
  });

  it('directly loads an evicted transaction instead of redirecting from the visible window', async () => {
    mockGetTransactionById.mockResolvedValue({
      id: 'evicted-row', kind: 'expense', amountMinor: 100, categoryId: 'dining',
      description: 'Evicted coffee', occurredOn: '2026-08-01', isRecurring: false,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    });
    const view = render(<EditTransactionRoute />);
    await waitFor(() => expect(view.getByText('Editing Evicted coffee')).toBeTruthy());
    expect(mockGetTransactionById).toHaveBeenCalledWith('evicted-row');
  });

  it('redirects only after a direct lookup confirms the row is absent', async () => {
    mockGetTransactionById.mockResolvedValue(null);
    const view = render(<EditTransactionRoute />);
    await waitFor(() => expect(view.getByText('Redirect /(tabs)/transactions')).toBeTruthy());
  });
});
