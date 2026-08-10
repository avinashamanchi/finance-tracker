import {
  requireActivePlus,
  type EntitlementStatus,
} from '../access/entitlements';
import type { RecurringTemplateDraft } from '../domain/recurrence';
import type { RecurringRepository } from './recurringRepository';

export class RecurringController {
  constructor(
    private readonly repository: RecurringRepository,
    private readonly readEntitlement: () => EntitlementStatus,
  ) {}

  async upsertTemplate(draft: RecurringTemplateDraft) {
    requireActivePlus(this.readEntitlement());
    return this.repository.upsertTemplate(draft);
  }

  archiveTemplate(templateId: string) {
    return this.repository.archiveTemplate(templateId);
  }

  async materializeExpectedOccurrences(today: string) {
    requireActivePlus(this.readEntitlement());
    return this.repository.materializeExpectedOccurrences(today);
  }

  listExpectedBills(start: string, end: string, today: string) {
    return this.repository.listExpectedBills(start, end, today);
  }

  recordExpectedBill(
    occurrenceId: string,
    input: Readonly<{ transactionId: string; occurredOn: string }>,
  ) {
    return this.repository.recordExpectedBill(occurrenceId, input);
  }
}
