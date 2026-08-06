import { parseBackup, serializeBackup } from '../src/services/backup';
import type { FinanceSnapshot, Transaction } from '../src/domain/types';

const transaction: Transaction = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'expense',
  amountCents: 1_250,
  categoryId: 'dining',
  description: 'Lunch',
  occurredOn: '2026-08-06',
  isRecurring: false,
  createdAt: '2026-08-06T12:00:00.000Z',
  updatedAt: '2026-08-06T12:00:00.000Z',
};
const snapshot: FinanceSnapshot = {
  transactions: [transaction],
  budgets: [{ categoryId: 'dining', limitCents: 20_000, updatedAt: '2026-08-06T12:00:00.000Z' }],
};

describe('versioned backup', () => {
  it('round-trips a strict v1 snapshot', () => {
    const raw = serializeBackup(snapshot, () => '2026-08-06T13:00:00.000Z');
    expect(JSON.parse(raw)).toMatchObject({ version: 1, exportedAt: '2026-08-06T13:00:00.000Z' });
    expect(parseBackup(raw)).toEqual(snapshot);
  });

  it('rejects unknown keys and unsupported versions', () => {
    const envelope = JSON.parse(serializeBackup(snapshot));
    expect(() => parseBackup(JSON.stringify({ ...envelope, secret: true }))).toThrow('valid Finova backup');
    expect(() => parseBackup(JSON.stringify({ ...envelope, version: 2 }))).toThrow('unsupported');
  });

  it('rejects duplicate IDs and invalid cents before replacement', () => {
    const envelope = JSON.parse(serializeBackup(snapshot));
    expect(() => parseBackup(JSON.stringify({
      ...envelope,
      transactions: [transaction, transaction],
    }))).toThrow('Duplicate');
    expect(() => parseBackup(JSON.stringify({
      ...envelope,
      transactions: [{ ...transaction, amountCents: -1 }],
    }))).toThrow('amount');
  });

  it('enforces a UTF-8 byte limit before JSON parsing', () => {
    const oversized = `{"padding":"${'x'.repeat(1_048_576)}"}`;
    expect(() => parseBackup(oversized)).toThrow('1 MiB');
  });
});
