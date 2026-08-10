import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  BillingProvider,
  useBilling,
  type BillingAppState,
  type BillingService,
} from '../src/billing/BillingProvider';
import type { BillingSnapshot } from '../src/billing/revenueCatService';

const snapshot = (
  status: BillingSnapshot['status'],
  source: BillingSnapshot['source'],
  availability: BillingSnapshot['availability'] = 'ready',
): BillingSnapshot => ({
  status,
  availability,
  products: [],
  refreshedAt: availability === 'ready' ? '2026-08-10T01:02:03.000Z' : null,
  source,
});

class FakeAppState implements BillingAppState {
  currentState: string | null = 'active';
  private listeners = new Set<(state: string) => void>();
  addEventListener(_type: 'change', listener: (state: string) => void) {
    this.listeners.add(listener);
    return { remove: () => { this.listeners.delete(listener); } };
  }
  emit(state: string) {
    this.currentState = state;
    for (const listener of this.listeners) listener(state);
  }
}

it('applies listener updates, refreshes on foreground, and cleans up the subscription', async () => {
  let listener: ((value: BillingSnapshot) => void) | undefined;
  const unsubscribe = jest.fn();
  const service: BillingService = {
    load: jest.fn(async (source = 'launch') => source === 'foreground'
      ? snapshot('active', 'foreground', 'error')
      : snapshot('inactive', source)),
    purchase: jest.fn(async () => snapshot('active', 'purchase')),
    restore: jest.fn(async () => snapshot('active', 'restore')),
    subscribe: jest.fn(async (next) => { listener = next; return unsubscribe; }),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
  };
  const appState = new FakeAppState();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BillingProvider appState={appState} service={service}>{children}</BillingProvider>
  );
  const rendered = renderHook(() => useBilling(), { wrapper });
  await waitFor(() => expect(rendered.result.current.status).toBe('inactive'));
  act(() => listener?.(snapshot('active', 'listener')));
  expect(rendered.result.current.status).toBe('active');

  act(() => appState.emit('background'));
  act(() => appState.emit('active'));
  await waitFor(() => expect(service.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(rendered.result.current.source).toBe('foreground'));
  expect(rendered.result.current.status).toBe('active');
  expect(rendered.result.current.availability).toBe('error');

  rendered.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('coalesces simultaneous provider reloads into one SDK request', async () => {
  let release!: (value: BillingSnapshot) => void;
  const service: BillingService = {
    load: jest.fn()
      .mockResolvedValueOnce(snapshot('inactive', 'launch'))
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })),
    purchase: jest.fn(async () => snapshot('active', 'purchase')),
    restore: jest.fn(async () => snapshot('active', 'restore')),
    subscribe: jest.fn(async () => () => undefined),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
  };
  const appState = new FakeAppState();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BillingProvider appState={appState} service={service}>{children}</BillingProvider>
  );
  const rendered = renderHook(() => useBilling(), { wrapper });
  await waitFor(() => expect(rendered.result.current.status).toBe('inactive'));
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = rendered.result.current.reload();
    second = rendered.result.current.reload();
  });
  expect(service.load).toHaveBeenCalledTimes(2);
  release(snapshot('inactive', 'launch'));
  await act(async () => { await Promise.all([first, second]); });
  expect(service.load).toHaveBeenCalledTimes(2);
});
