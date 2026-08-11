export type EntitlementStatus = 'active' | 'inactive' | 'unknown';

export class PlusRequiredError extends Error {
  constructor() {
    super('Finova Plus is required for this action. Existing finance data remains available.');
    this.name = 'PlusRequiredError';
  }
}

export function hasActivePlus(status: EntitlementStatus): boolean {
  return status === 'active';
}

export function requireActivePlus(status: EntitlementStatus): void {
  if (!hasActivePlus(status)) throw new PlusRequiredError();
}
