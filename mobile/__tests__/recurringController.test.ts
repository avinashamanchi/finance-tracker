import { RecurringController } from '../src/data/recurringController';

const draft = {
  id: '22222222-2222-4222-8222-222222222222',
  ledgerId: '11111111-1111-4111-8111-111111111111',
  description: 'Rent',
  categoryId: 'housing' as const,
  amountMinor: 250_000,
  dueDay: 1,
  startMonth: '2026-08',
  endMonth: null,
  enabled: true,
};

it.each(['inactive', 'unknown'] as const)('blocks new Plus recurring mutations while %s', async (status) => {
  const repository = {
    upsertTemplate: jest.fn(),
    archiveTemplate: jest.fn(),
    materializeExpectedOccurrences: jest.fn(),
    listExpectedBills: jest.fn(),
    recordExpectedBill: jest.fn(),
  };
  const controller = new RecurringController(repository, () => status);
  await expect(controller.upsertTemplate(draft)).rejects.toThrow('Finova Plus');
  expect(repository.upsertTemplate).not.toHaveBeenCalled();
});

it('allows recording an already expected bill after downgrade', async () => {
  const transaction = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const repository = {
    upsertTemplate: jest.fn(),
    archiveTemplate: jest.fn(),
    materializeExpectedOccurrences: jest.fn(),
    listExpectedBills: jest.fn(),
    recordExpectedBill: jest.fn().mockResolvedValue(transaction),
  };
  const controller = new RecurringController(repository, () => 'inactive');
  await expect(controller.recordExpectedBill('occurrence', {
    transactionId: transaction.id,
    occurredOn: '2026-08-10',
  })).resolves.toBe(transaction);
});
