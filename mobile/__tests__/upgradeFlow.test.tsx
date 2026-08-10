import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import UpgradeScreen from '../app/upgrade';
import { BillingProvider, type BillingService } from '../src/billing/BillingProvider';
import type { BillingSnapshot } from '../src/billing/revenueCatService';
import { PRIVACY_URL, TERMS_URL } from '../src/legal/links';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => undefined) }));

const ready: BillingSnapshot = {
  availability: 'ready',
  entitlementActive: false,
  products: [{
    id: 'com.avinashamanchi.finova.plus.lifetime',
    title: 'Finova Plus Lifetime',
    description: 'Unlimited budgets, six-month insights, and CSV export.',
    price: '$9.99',
    period: null,
  }],
};

function service(snapshot: BillingSnapshot = ready): BillingService {
  return {
    load: jest.fn(async () => snapshot),
    purchase: jest.fn(async () => ({ ...snapshot, entitlementActive: true })),
    restore: jest.fn(async () => snapshot),
  };
}

it('offers a one-time Plus purchase with a free escape, restore, and legal links', async () => {
  const billing = service();
  const view = render(<BillingProvider service={billing}><UpgradeScreen /></BillingProvider>);

  await waitFor(() => expect(view.getByRole('button', { name: 'Unlock Finova Plus for $9.99 one time' })).toBeTruthy());
  expect(view.getAllByText(/Unlimited budgets/i).length).toBeGreaterThan(0);
  expect(view.getAllByText(/Six-month insights/i).length).toBeGreaterThan(0);
  expect(view.getAllByText(/CSV export/i).length).toBeGreaterThan(0);
  expect(view.getByText(/one-time unlock, not a subscription/i)).toBeTruthy();
  expect(view.queryByText(/auto-renew|per month|per year/i)).toBeNull();

  await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Continue with Free' })); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Restore Purchases' })); });
  expect(billing.restore).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.press(view.getByRole('link', { name: 'Privacy Policy' })); });
  expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_URL);
  await act(async () => { fireEvent.press(view.getByRole('link', { name: 'Terms of Use' })); });
  expect(Linking.openURL).toHaveBeenCalledWith(TERMS_URL);
});

it('makes Expo Go a non-purchasing preview', async () => {
  const preview: BillingSnapshot = { availability: 'preview', entitlementActive: false, products: [] };
  const view = render(<BillingProvider service={service(preview)}><UpgradeScreen /></BillingProvider>);
  await waitFor(() => expect(view.getByText(/Expo Go can preview this screen/i)).toBeTruthy());
  expect(view.queryByText(/\$9\.99/)).toBeNull();
  expect(view.queryByRole('button', { name: /Unlock Finova Plus for/i })).toBeNull();
});

it('keeps Restore Purchases available when the offering request fails', async () => {
  const failed: BillingSnapshot = { availability: 'error', entitlementActive: false, products: [] };
  const billing = service(failed);
  const view = render(<BillingProvider service={billing}><UpgradeScreen /></BillingProvider>);
  await waitFor(() => expect(view.getByText(/could not load purchase options/i)).toBeTruthy());

  const restore = view.getByRole('button', { name: 'Restore Purchases' });
  expect(restore.props.accessibilityState).toEqual({ disabled: false });
  await act(async () => { fireEvent.press(restore); });
  expect(billing.restore).toHaveBeenCalledTimes(1);
});
