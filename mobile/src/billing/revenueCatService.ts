import type { EntitlementStatus } from '../access/entitlements';
import {
  entitlementStatusFromCustomerInfo,
  statusAfterRefreshFailure,
} from './entitlementPolicy';

export type BillingAvailability = 'ready' | 'preview' | 'configuration' | 'error';
export type BillingProduct = Readonly<{
  id: string;
  title: string;
  description: string;
  price: string;
  period: string | null;
}>;
export type EntitlementSource = 'launch' | 'foreground' | 'listener' | 'purchase' | 'restore';
export type EntitlementSnapshot = Readonly<{
  status: EntitlementStatus;
  availability: BillingAvailability;
  products: readonly BillingProduct[];
  refreshedAt: string | null;
  source: EntitlementSource;
}>;
export type BillingSnapshot = EntitlementSnapshot;

type RevenueCatPackage = Readonly<{
  identifier: string;
  packageType: string;
  product: Readonly<{
    identifier: string;
    title: string;
    description: string;
    priceString: string;
    subscriptionPeriod?: string | null;
  }>;
}>;
export type RevenueCatCustomerInfo = Readonly<{
  entitlements: Readonly<{ active: Readonly<Record<string, Readonly<{ isActive?: boolean }>>> }>;
}>;
export type CustomerInfoListener = (customerInfo: RevenueCatCustomerInfo) => void;
export type RevenueCatModule = Readonly<{
  configure(options: Readonly<{ apiKey: string }>): void;
  getOfferings(): Promise<Readonly<{ current: Readonly<{ availablePackages: readonly RevenueCatPackage[] }> | null }>>;
  getCustomerInfo(): Promise<RevenueCatCustomerInfo>;
  purchasePackage(item: RevenueCatPackage): Promise<Readonly<{ customerInfo: RevenueCatCustomerInfo }>>;
  restorePurchases(): Promise<RevenueCatCustomerInfo>;
  addCustomerInfoUpdateListener(listener: CustomerInfoListener): void;
  removeCustomerInfoUpdateListener(listener: CustomerInfoListener): boolean;
  invalidateCustomerInfoCache(): Promise<void>;
}>;
type RevenueCatBillingOptions = Readonly<{
  apiKey: string | undefined;
  entitlementId: string;
  executionEnvironment: string;
  moduleLoader?: () => RevenueCatModule | Promise<RevenueCatModule>;
  productIds: readonly string[];
  now?: () => string;
}>;

const EMPTY_PRODUCTS: readonly BillingProduct[] = Object.freeze([]);
export class PurchaseCancelledError extends Error {
  constructor() { super('Purchase cancelled.'); this.name = 'PurchaseCancelledError'; }
}
export class BillingUnavailableError extends Error {
  constructor() { super('Purchases are unavailable.'); this.name = 'BillingUnavailableError'; }
}
const defaultModuleLoader = async (): Promise<RevenueCatModule> => {
  const loaded = await import('react-native-purchases');
  return loaded.default as unknown as RevenueCatModule;
};

export class RevenueCatBillingService {
  private module: RevenueCatModule | null = null;
  private modulePromise: Promise<RevenueCatModule> | null = null;
  private configured = false;
  private readonly packageByProductId = new Map<string, RevenueCatPackage>();
  private products: readonly BillingProduct[] = EMPTY_PRODUCTS;
  private status: EntitlementStatus = 'unknown';
  private refreshInFlight: Promise<BillingSnapshot> | null = null;
  private readonly now: () => string;

  constructor(private readonly options: RevenueCatBillingOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  load(source: EntitlementSource = 'launch'): Promise<BillingSnapshot> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const operation = this.refresh(source).finally(() => {
      if (this.refreshInFlight === operation) this.refreshInFlight = null;
    });
    this.refreshInFlight = operation;
    return operation;
  }

  async purchase(productId: string): Promise<BillingSnapshot> {
    if (this.unavailableSnapshot('purchase') !== null) throw new BillingUnavailableError();
    if (this.refreshInFlight) await this.refreshInFlight;
    const purchases = await this.getConfiguredModule();
    if (this.packageByProductId.size === 0) {
      const loaded = await this.load('purchase');
      if (loaded.availability !== 'ready') throw new BillingUnavailableError();
    }
    const item = this.packageByProductId.get(productId);
    if (!item) throw new BillingUnavailableError();
    try {
      const result = await purchases.purchasePackage(item);
      return this.authoritativeSnapshot(result.customerInfo, 'purchase');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'userCancelled' in error && error.userCancelled === true) {
        throw new PurchaseCancelledError();
      }
      throw new BillingUnavailableError();
    }
  }

  async restore(): Promise<BillingSnapshot> {
    if (this.unavailableSnapshot('restore') !== null) throw new BillingUnavailableError();
    if (this.refreshInFlight) await this.refreshInFlight;
    try {
      return this.authoritativeSnapshot(
        await (await this.getConfiguredModule()).restorePurchases(),
        'restore',
      );
    } catch {
      throw new BillingUnavailableError();
    }
  }

  async subscribe(listener: (snapshot: BillingSnapshot) => void): Promise<() => void> {
    if (this.unavailableSnapshot('listener') !== null) return () => undefined;
    const purchases = await this.getConfiguredModule();
    const customerInfoListener: CustomerInfoListener = (customerInfo) => {
      listener(this.authoritativeSnapshot(customerInfo, 'listener'));
    };
    purchases.addCustomerInfoUpdateListener(customerInfoListener);
    return () => { purchases.removeCustomerInfoUpdateListener(customerInfoListener); };
  }

  async invalidateCustomerInfoCache(): Promise<void> {
    if (this.unavailableSnapshot('foreground') !== null) return;
    await (await this.getConfiguredModule()).invalidateCustomerInfoCache();
  }

  private async refresh(source: EntitlementSource): Promise<BillingSnapshot> {
    const unavailable = this.unavailableSnapshot(source);
    if (unavailable !== null) return unavailable;
    try {
      const purchases = await this.getConfiguredModule();
      const [offerings, customerInfo] = await Promise.allSettled([
        purchases.getOfferings(),
        purchases.getCustomerInfo(),
      ]);
      if (offerings.status === 'fulfilled') {
        this.packageByProductId.clear();
        const allowed = new Set(this.options.productIds);
        for (const item of offerings.value.current?.availablePackages ?? []) {
          if (allowed.has(item.product.identifier)) this.packageByProductId.set(item.product.identifier, item);
        }
        this.products = this.options.productIds.flatMap((productId) => {
          const item = this.packageByProductId.get(productId);
          return item ? [this.mapProduct(item)] : [];
        });
      }
      if (customerInfo.status === 'fulfilled') {
        const verified = this.authoritativeSnapshot(customerInfo.value, source);
        return offerings.status === 'fulfilled'
          ? verified
          : { ...verified, availability: 'error' };
      }
      return this.failureSnapshot(source);
    } catch {
      return this.failureSnapshot(source);
    }
  }

  private unavailableSnapshot(source: EntitlementSource): BillingSnapshot | null {
    if (this.options.executionEnvironment === 'storeClient') {
      return {
        status: 'unknown',
        availability: 'preview',
        products: EMPTY_PRODUCTS,
        refreshedAt: null,
        source,
      };
    }
    if (!this.options.apiKey?.trim()) {
      return {
        status: 'unknown',
        availability: 'configuration',
        products: EMPTY_PRODUCTS,
        refreshedAt: null,
        source,
      };
    }
    return null;
  }

  private async getConfiguredModule(): Promise<RevenueCatModule> {
    if (!this.module) {
      this.modulePromise ??= Promise.resolve((this.options.moduleLoader ?? defaultModuleLoader)());
      try {
        this.module = await this.modulePromise;
      } catch (error) {
        this.modulePromise = null;
        throw error;
      }
    }
    if (!this.configured) {
      this.module.configure({ apiKey: this.options.apiKey as string });
      this.configured = true;
    }
    return this.module;
  }

  private mapProduct(item: RevenueCatPackage): BillingProduct {
    return {
      id: item.product.identifier,
      title: item.product.title,
      description: item.product.description,
      price: item.product.priceString,
      period: item.product.subscriptionPeriod ?? null,
    };
  }

  private authoritativeSnapshot(
    customerInfo: RevenueCatCustomerInfo,
    source: EntitlementSource,
  ): BillingSnapshot {
    this.status = entitlementStatusFromCustomerInfo(customerInfo, this.options.entitlementId);
    const refreshedAt = this.now();
    if (!Number.isFinite(Date.parse(refreshedAt))) throw new BillingUnavailableError();
    return {
      status: this.status,
      availability: 'ready',
      products: this.products,
      refreshedAt,
      source,
    };
  }

  private failureSnapshot(source: EntitlementSource): BillingSnapshot {
    return {
      status: statusAfterRefreshFailure(this.status),
      availability: 'error',
      products: this.products,
      refreshedAt: null,
      source,
    };
  }
}
