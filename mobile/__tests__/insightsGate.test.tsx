import { act, fireEvent, waitFor } from '@testing-library/react-native';
import InsightsRoute from '../app/insights';
import { BillingProvider, type BillingService } from '../src/billing/BillingProvider';
import { renderWithFinance } from '../test-utils/renderWithFinance';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

it('routes a free user from six-month insights to the transparent Plus screen', async () => {
  const service: BillingService = {
    load: jest.fn(async () => ({ availability: 'preview' as const, status: 'unknown' as const, products: [], refreshedAt: null, source: 'launch' as const })),
    subscribe: jest.fn(async () => () => undefined),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
    purchase: jest.fn(),
    restore: jest.fn(),
  };
  const view = await renderWithFinance(<BillingProvider service={service}><InsightsRoute /></BillingProvider>);

  await waitFor(() => expect(view.getByText('Six-month insights are in Finova Plus.')).toBeTruthy());
  expect(view.getByText(/Monthly totals and your local ledger remain free/i)).toBeTruthy();
  await act(async () => { fireEvent.press(view.getByRole('button', { name: 'View Finova Plus' })); });
  expect(mockPush).toHaveBeenCalledWith('/upgrade');
});
