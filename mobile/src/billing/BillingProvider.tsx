import Constants from 'expo-constants';
import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BillingUnavailableError,
  PurchaseCancelledError,
  RevenueCatBillingService,
  type BillingAvailability,
  type BillingProduct,
  type BillingSnapshot,
} from './revenueCatService';

export const FINOVA_PLUS_ENTITLEMENT = 'finova_plus';
export const FINOVA_PLUS_PRODUCT_IDS = Object.freeze(['com.avinashamanchi.finova.plus.lifetime']);
export interface BillingService {
  load(): Promise<BillingSnapshot>;
  purchase(productId: string): Promise<BillingSnapshot>;
  restore(): Promise<BillingSnapshot>;
}
export type BillingContextValue = Readonly<{
  availability: BillingAvailability | 'loading';
  entitlementActive: boolean;
  products: readonly BillingProduct[];
  busy: boolean;
  message: string | null;
  purchase(productId: string): Promise<void>;
  restore(): Promise<void>;
  reload(): Promise<void>;
}>;
const fallback: BillingContextValue = {
  availability: 'preview', entitlementActive: false, products: [], busy: false, message: null,
  purchase: async () => {}, restore: async () => {}, reload: async () => {},
};
const BillingContext = createContext<BillingContextValue>(fallback);
const defaultService = new RevenueCatBillingService({
  apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  entitlementId: FINOVA_PLUS_ENTITLEMENT,
  executionEnvironment: Constants.executionEnvironment,
  productIds: FINOVA_PLUS_PRODUCT_IDS,
});

export function BillingProvider({ children, service = defaultService }: Readonly<{ children: ReactNode; service?: BillingService }>) {
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = useCallback(async (
    operation: () => Promise<BillingSnapshot>,
    success: (next: BillingSnapshot) => string | null,
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const next = await operation();
      if (mounted.current) { setSnapshot(next); setMessage(success(next)); }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof PurchaseCancelledError
          ? 'Purchase cancelled. No charge was completed.'
          : error instanceof BillingUnavailableError
            ? 'App Store purchases are unavailable in this build.'
            : 'The App Store action could not be completed. Free remains available.');
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  const reload = useCallback(() => run(() => service.load(), () => null), [run, service]);
  const purchase = useCallback((id: string) => run(
    () => service.purchase(id),
    next => next.entitlementActive ? 'Finova Plus is active.' : 'The purchase did not activate Finova Plus. Try Restore Purchases.',
  ), [run, service]);
  const restore = useCallback(() => run(
    () => service.restore(),
    next => next.entitlementActive ? 'Purchases restored. Finova Plus is active.' : 'No Finova Plus purchase was found.',
  ), [run, service]);
  useEffect(() => { void reload(); }, [reload]);
  const value = useMemo<BillingContextValue>(() => ({
    availability: snapshot?.availability ?? 'loading', entitlementActive: snapshot?.entitlementActive ?? false,
    products: snapshot?.products ?? [], busy, message, purchase, restore, reload,
  }), [busy, message, purchase, reload, restore, snapshot]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
export function useBilling(): BillingContextValue { return useContext(BillingContext); }
