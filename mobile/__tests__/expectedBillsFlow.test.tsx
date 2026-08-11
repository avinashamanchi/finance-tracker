import { fireEvent, waitFor } from '@testing-library/react-native';

import type { RecurringRepository } from '../src/data/recurringRepository';
import type { ExpectedBill } from '../src/domain/recurrence';
import type { Ledger } from '../src/domain/types';
import { ExpectedBillRecordScreen } from '../src/screens/ExpectedBillRecordScreen';
import { ExpectedBillsScreen } from '../src/screens/ExpectedBillsScreen';
import { renderWithFinance } from '../test-utils/renderWithFinance';

const ledger: Ledger = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'My Finova ledger',
  currencyCode: 'USD',
  currencyMinorUnit: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const bill: ExpectedBill = {
  id: '20000000-0000-4000-8000-000000000001',
  templateId: '30000000-0000-4000-8000-000000000001',
  dueOn: '2026-08-10',
  transactionId: null,
  status: 'due',
  template: {
    id: '30000000-0000-4000-8000-000000000001',
    ledgerId: ledger.id,
    description: 'Internet service',
    categoryId: 'utilities',
    amountMinor: 8_500,
    dueDay: 10,
    startMonth: '2026-08',
    endMonth: null,
    enabled: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};

function repository(): jest.Mocked<RecurringRepository> {
  const result: RecurringRepository = {
    getTemplate: jest.fn(async () => bill.template),
    upsertTemplate: jest.fn(),
    archiveTemplate: jest.fn(),
    materializeExpectedOccurrences: jest.fn(async () => {}),
    listExpectedBills: jest.fn(async () => [bill]),
    recordExpectedBill: jest.fn(async (_id, input) => ({
      id: input.transactionId,
      kind: 'expense' as const,
      amountMinor: bill.template.amountMinor,
      categoryId: bill.template.categoryId,
      description: bill.template.description,
      occurredOn: input.occurredOn,
      isRecurring: true,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })),
  };
  return result as jest.Mocked<RecurringRepository>;
}

describe('expected bill iOS flow', () => {
  it('keeps existing plans readable but does not materialize new dates without verified Plus', async () => {
    const recurring = repository();
    const onUpgrade = jest.fn();
    const onRecord = jest.fn();
    const view = await renderWithFinance(
      <ExpectedBillsScreen
        entitlement="unknown"
        ledger={ledger}
        onEditTemplate={jest.fn()}
        onNewTemplate={jest.fn()}
        onRecord={onRecord}
        onUpgrade={onUpgrade}
        repository={recurring}
      />,
    );

    await waitFor(() => expect(view.getByText('Internet service')).toBeTruthy());
    expect(recurring.materializeExpectedOccurrences).not.toHaveBeenCalled();
    expect(view.getByText(/temporarily unavailable/i)).toBeTruthy();
    fireEvent.press(view.getByLabelText('Unlock recurring bill planning'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByLabelText('Record expected Internet service bill'));
    expect(onRecord).toHaveBeenCalledWith(bill);
  });

  it('creates expected dates only for active Plus and records only after final confirmation', async () => {
    const recurring = repository();
    const onRecorded = jest.fn(async () => {});
    const list = await renderWithFinance(
      <ExpectedBillsScreen
        entitlement="active"
        ledger={ledger}
        onEditTemplate={jest.fn()}
        onNewTemplate={jest.fn()}
        onRecord={jest.fn()}
        onUpgrade={jest.fn()}
        repository={recurring}
      />,
    );
    await waitFor(() => expect(list.getByText('Internet service')).toBeTruthy());
    expect(recurring.materializeExpectedOccurrences).toHaveBeenCalledTimes(1);
    expect(recurring.recordExpectedBill).not.toHaveBeenCalled();

    const review = await renderWithFinance(
      <ExpectedBillRecordScreen
        ledger={ledger}
        occurrenceId={bill.id}
        onCancel={jest.fn()}
        onRecorded={onRecorded}
        repository={recurring}
      />,
    );
    await waitFor(() => expect(review.getByText('Nothing has been added to your ledger yet. Confirm the exact record below.')).toBeTruthy());
    expect(recurring.recordExpectedBill).not.toHaveBeenCalled();
    fireEvent.press(review.getByLabelText('Confirm and record Internet service bill'));
    await waitFor(() => expect(recurring.recordExpectedBill).toHaveBeenCalledTimes(1));
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });
});
