import {
  RevenueCatBillingService,
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
} {
  return {
    configure: jest.fn(),
    getOfferings: jest.fn(async () => ({ current: { availablePackages: [lifetime] } })),
    getCustomerInfo: jest.fn(async () => customerInfo(false)),
    purchasePackage: jest.fn(async () => ({ customerInfo: customerInfo(true) })),
    restorePurchases: jest.fn(async () => customerInfo(true)),
  };
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
    availability: 'preview', entitlementActive: false, products: [],
  });
  expect(loader).not.toHaveBeenCalled();
});

it('maps the one-time StoreKit product and activates Finova Plus after purchase', async () => {
  const purchases = fakeModule();
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public_key',
    entitlementId: 'finova_plus',
    executionEnvironment: 'standalone',
    moduleLoader: () => purchases,
    productIds: ['com.avinashamanchi.finova.plus.lifetime'],
  });

  await expect(service.load()).resolves.toEqual({
    availability: 'ready',
    entitlementActive: false,
    products: [{
      id: 'com.avinashamanchi.finova.plus.lifetime',
      title: 'Finova Plus Lifetime',
      description: 'Unlimited budgets, six-month insights, and CSV export.',
      price: '$9.99',
      period: null,
    }],
  });
  await expect(service.purchase('com.avinashamanchi.finova.plus.lifetime'))
    .resolves.toMatchObject({ availability: 'ready', entitlementActive: true });
  expect(purchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_public_key' });
  expect(purchases.purchasePackage).toHaveBeenCalledWith(lifetime);
});

it('retains a verified Plus entitlement when offerings cannot load', async () => {
  const purchases = fakeModule();
  purchases.getOfferings.mockRejectedValueOnce(new Error('offline'));
  purchases.getCustomerInfo.mockResolvedValueOnce(customerInfo(true));
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public_key',
    entitlementId: 'finova_plus',
    executionEnvironment: 'standalone',
    moduleLoader: () => purchases,
    productIds: ['com.avinashamanchi.finova.plus.lifetime'],
  });

  await expect(service.load()).resolves.toEqual({
    availability: 'error', entitlementActive: true, products: [],
  });
});
