import Constants from 'expo-constants';
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { hasActivePlus, type EntitlementStatus } from '../access/entitlements';
import {
  BillingUnavailableError,
  PurchaseCancelledError,
  RevenueCatBillingService,
  type BillingAvailability,
  type BillingProduct,
  type BillingSnapshot,
  type EntitlementSource,
} from './revenueCatService';

export const FINOVA_PLUS_ENTITLEMENT = 'finova_plus';
export const FINOVA_PLUS_PRODUCT_IDS = Object.freeze(['com.avinashamanchi.finova.plus.lifetime']);

export interface BillingService {
  load(source?: EntitlementSource): Promise<BillingSnapshot>;
  purchase(productId: string): Promise<BillingSnapshot>;
  restore(): Promise<BillingSnapshot>;
  subscribe(listener: (snapshot: BillingSnapshot) => void): Promise<() => void>;
  invalidateCustomerInfoCache(): Promise<void>;
}

export interface BillingAppState {
  readonly currentState: string | null;
  addEventListener(type: 'change', listener: (state: string) => void): Readonly<{ remove(): void }>;
}

export type BillingContextValue = Readonly<{
  availability: BillingAvailability | 'loading';
  status: EntitlementStatus;
  entitlementActive: boolean;
  products: readonly BillingProduct[];
  refreshedAt: string | null;
  source: EntitlementSource | null;
  busy: boolean;
  message: string | null;
  purchase(productId: string): Promise<void>;
  restore(): Promise<void>;
  reload(): Promise<void>;
}>;

const fallback: BillingContextValue = {
  availability: 'preview',
  status: 'unknown',
  entitlementActive: false,
  products: [],
  refreshedAt: null,
  source: null,
  busy: false,
  message: null,
  purchase: async () => {},
  restore: async () => {},
  reload: async () => {},
};
const BillingContext = createContext<BillingContextValue>(fallback);
const defaultService = new RevenueCatBillingService({
  apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  entitlementId: FINOVA_PLUS_ENTITLEMENT,
  executionEnvironment: Constants.executionEnvironment,
  productIds: FINOVA_PLUS_PRODUCT_IDS,
});

export function BillingProvider({
  children,
  service = defaultService,
  appState = AppState,
}: Readonly<{
  children: ReactNode;
  service?: BillingService;
  appState?: BillingAppState;
}>) {
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<BillingSnapshot> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (
    operation: () => Promise<BillingSnapshot>,
    success: (next: BillingSnapshot) => string | null,
  ) => {
    if (inFlight.current) {
      await inFlight.current.catch(() => undefined);
      return;
    }
    setBusy(true);
    setMessage(null);
    const request = operation();
    inFlight.current = request;
    try {
      const next = await request;
      if (mounted.current) {
        setSnapshot(next);
        setMessage(success(next));
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof PurchaseCancelledError
          ? 'Purchase cancelled. No charge was completed.'
          : error instanceof BillingUnavailableError
            ? 'App Store purchases are unavailable in this build.'
            : 'The App Store action could not be completed. Free remains available.');
      }
    } finally {
      if (inFlight.current === request) inFlight.current = null;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const reloadFrom = useCallback((source: EntitlementSource) => run(
    () => service.load(source),
    () => null,
  ), [run, service]);
  const reload = useCallback(() => reloadFrom('launch'), [reloadFrom]);
  const purchase = useCallback((id: string) => run(
    () => service.purchase(id),
    next => next.status === 'active'
      ? 'Finova Plus is active.'
      : 'The purchase did not activate Finova Plus. Try Restore Purchases.',
  ), [run, service]);
  const restore = useCallback(() => run(
    () => service.restore(),
    next => next.status === 'active'
      ? 'Purchases restored. Finova Plus is active.'
      : 'No Finova Plus purchase was found for this Apple account.',
  ), [run, service]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void service.subscribe((next) => {
      if (active && mounted.current) setSnapshot(next);
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [service]);

  useEffect(() => {
    let previous = appState.currentState;
    const subscription = appState.addEventListener('change', (next) => {
      const foregrounded = next === 'active' && previous !== 'active';
      previous = next;
      if (!foregrounded) return;
      void service.invalidateCustomerInfoCache()
        .then(() => reloadFrom('foreground'))
        .catch(() => reloadFrom('foreground'));
    });
    return () => subscription.remove();
  }, [appState, reloadFrom, service]);

  useEffect(() => { void reloadFrom('launch'); }, [reloadFrom]);

  const status = snapshot?.status ?? 'unknown';
  const value = useMemo<BillingContextValue>(() => ({
    availability: snapshot?.availability ?? 'loading',
    status,
    entitlementActive: hasActivePlus(status),
    products: snapshot?.products ?? [],
    refreshedAt: snapshot?.refreshedAt ?? null,
    source: snapshot?.source ?? null,
    busy,
    message,
    purchase,
    restore,
    reload,
  }), [busy, message, purchase, reload, restore, snapshot, status]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  return useContext(BillingContext);
}
