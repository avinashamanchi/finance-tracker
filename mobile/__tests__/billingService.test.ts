import {
  PurchaseCancelledError,
  RevenueCatBillingService,
  type CustomerInfoListener,
  type RevenueCatModule,
} from '../src/billing/revenueCatService';

const lifetime = {
  identifier: '$rc_lifetime',
  packageType: 'LIFETIME',
  product: {
    identifier: 'com.avinashamanchi.finova.plus.lifetime',
    title: 'Finova Plus Lifetime',
    description: 'Unlimited budgets, six-month insights, and CSV export.',
    priceString: '$9.99',
    subscriptionPeriod: null,
  },
};

type CustomerInfo = Awaited<ReturnType<RevenueCatModule['getCustomerInfo']>>;

const customerInfo = (active: boolean): CustomerInfo => ({
  entitlements: {
    active: active ? { finova_plus: { isActive: true } } : {},
  },
});

function fakeModule(): RevenueCatModule & {
  configure: jest.Mock;
  getCustomerInfo: jest.Mock;
  getOfferings: jest.Mock;
  purchasePackage: jest.Mock;
  restorePurchases: jest.Mock;
  invalidateCustomerInfoCache: jest.Mock;
  emit(info: CustomerInfo): void;
  listenerCount(): number;
} {
  const listeners = new Set<CustomerInfoListener>();
  return {
    configure: jest.fn(),
    getOfferings: jest.fn(async () => ({ current: { availablePackages: [lifetime] } })),
    getCustomerInfo: jest.fn(async () => customerInfo(false)),
    purchasePackage: jest.fn(async () => ({ customerInfo: customerInfo(true) })),
    restorePurchases: jest.fn(async () => customerInfo(true)),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
    addCustomerInfoUpdateListener: jest.fn((listener: CustomerInfoListener) => { listeners.add(listener); }),
    removeCustomerInfoUpdateListener: jest.fn((listener: CustomerInfoListener) => listeners.delete(listener)),
    emit: (info) => { for (const listener of listeners) listener(info); },
    listenerCount: () => listeners.size,
  };
}

function serviceWith(purchases: ReturnType<typeof fakeModule>) {
  return new RevenueCatBillingService({
    apiKey: 'appl_public_key',
    entitlementId: 'finova_plus',
    executionEnvironment: 'standalone',
    moduleLoader: () => purchases,
    productIds: ['com.avinashamanchi.finova.plus.lifetime'],
    now: () => '2026-08-10T01:02:03.000Z',
  });
}

it('keeps Expo Go in preview mode without loading native billing code', async () => {
  const loader = jest.fn();
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public_key',
    entitlementId: 'finova_plus',
    executionEnvironment: 'storeClient',
    moduleLoader: loader,
    productIds: ['com.avinashamanchi.finova.plus.lifetime'],
  });

  await expect(service.load()).resolves.toEqual({
    status: 'unknown', availability: 'preview', products: [], refreshedAt: null, source: 'launch',
  });
  expect(loader).not.toHaveBeenCalled();
});

it('maps the localized one-time product and activates only from authoritative customer info', async () => {
  const purchases = fakeModule();
  const service = serviceWith(purchases);

  await expect(service.load()).resolves.toEqual({
    status: 'inactive',
    availability: 'ready',
    refreshedAt: '2026-08-10T01:02:03.000Z',
    source: 'launch',
    products: [{
      id: 'com.avinashamanchi.finova.plus.lifetime',
      title: 'Finova Plus Lifetime',
      description: 'Unlimited budgets, six-month insights, and CSV export.',
      price: '$9.99',
      period: null,
    }],
  });
  await expect(service.purchase('com.avinashamanchi.finova.plus.lifetime'))
    .resolves.toMatchObject({ availability: 'ready', status: 'active', source: 'purchase' });
  expect(purchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_public_key' });
  expect(purchases.purchasePackage).toHaveBeenCalledWith(lifetime);
  expect(purchases.configure.mock.calls.flat()).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ appUserID: expect.anything() }),
  ]));
});

it('retains the last authoritative entitlement across a later offline refresh', async () => {
  const purchases = fakeModule();
  purchases.getCustomerInfo.mockResolvedValueOnce(customerInfo(true));
  const service = serviceWith(purchases);
  await expect(service.load()).resolves.toMatchObject({ status: 'active', availability: 'ready' });
  purchases.getOfferings.mockRejectedValueOnce(new Error('offline'));
  purchases.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
  await expect(service.load('foreground')).resolves.toMatchObject({
    availability: 'error', status: 'active', source: 'foreground', refreshedAt: null,
  });
});

it('coalesces simultaneous refreshes and manages the exact listener lifecycle', async () => {
  const purchases = fakeModule();
  let resolveInfo!: (value: CustomerInfo) => void;
  purchases.getCustomerInfo.mockImplementationOnce(() => new Promise((resolve) => { resolveInfo = resolve; }));
  const service = serviceWith(purchases);
  const first = service.load();
  const second = service.load();
  expect(first).toBe(second);
  for (let attempt = 0; attempt < 10 && !resolveInfo; attempt += 1) await Promise.resolve();
  resolveInfo(customerInfo(false));
  await Promise.all([first, second]);
  expect(purchases.getCustomerInfo).toHaveBeenCalledTimes(1);

  const listener = jest.fn();
  const unsubscribe = await service.subscribe(listener);
  expect(purchases.listenerCount()).toBe(1);
  purchases.emit(customerInfo(true));
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', source: 'listener' }));
  unsubscribe();
  expect(purchases.listenerCount()).toBe(0);
  await service.invalidateCustomerInfoCache();
  expect(purchases.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
});

it('distinguishes user cancellation and allows restore to activate after reinstall', async () => {
  const purchases = fakeModule();
  const service = serviceWith(purchases);
  await service.load();
  purchases.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
  await expect(service.purchase(lifetime.product.identifier)).rejects.toBeInstanceOf(PurchaseCancelledError);
  await expect(service.restore()).resolves.toMatchObject({ status: 'active', source: 'restore' });
});
