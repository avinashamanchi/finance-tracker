import type { EntitlementStatus } from '../access/entitlements';

export function entitlementStatusFromCustomerInfo(
  customerInfo: Readonly<{
    entitlements: Readonly<{ active: Readonly<Record<string, Readonly<{ isActive?: boolean }>>> }>;
  }>,
  entitlementId: string,
): EntitlementStatus {
  return customerInfo.entitlements.active[entitlementId]?.isActive === true
    ? 'active'
    : 'inactive';
}

export function statusAfterRefreshFailure(
  lastAuthoritativeStatus: EntitlementStatus,
): EntitlementStatus {
  return lastAuthoritativeStatus;
}
