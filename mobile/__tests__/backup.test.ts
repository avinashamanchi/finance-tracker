import { parseBackup, serializeBackup } from '../src/services/backup';
import type { FinanceSnapshot, Ledger, Transaction } from '../src/domain/types';

const ledger: Ledger = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Personal', currencyCode: 'USD', currencyMinorUnit: 2,
  createdAt: '2026-08-06T12:00:00.000Z', updatedAt: '2026-08-06T12:00:00.000Z',
};

const transaction: Transaction = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'expense',
  amountMinor: 1_250,
  categoryId: 'dining',
  description: 'Lunch',
  occurredOn: '2026-08-06',
  isRecurring: false,
  createdAt: '2026-08-06T12:00:00.000Z',
  updatedAt: '2026-08-06T12:00:00.000Z',
};
const snapshot: FinanceSnapshot = {
  transactions: [transaction],
  budgets: [{ categoryId: 'dining', limitMinor: 20_000, updatedAt: '2026-08-06T12:00:00.000Z' }],
};

describe('versioned backup', () => {
  it('round-trips a strict v1 snapshot', () => {
    const raw = serializeBackup(snapshot, ledger, () => '2026-08-06T13:00:00.000Z');
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
      exportedAt: '2026-08-06T13:00:00.000Z',
      transactions: [{ amountCents: 1_250 }],
      budgets: [{ limitCents: 20_000 }],
    });
    expect(JSON.parse(raw).transactions[0]).not.toHaveProperty('amountMinor');
    expect(parseBackup(raw)).toEqual(snapshot);
  });

  it('imports an independent frozen pre-rename v1 literal with legacy identifiers', () => {
    const raw = JSON.stringify({
      version: 1,
      exportedAt: '2026-08-06T13:00:00.000Z',
      transactions: [{
        id: 'legacy-transaction',
        kind: 'expense',
        amountCents: 1_250,
        categoryId: 'dining',
        description: 'Lunch',
        occurredOn: '2026-08-06',
        isRecurring: false,
        createdAt: '2026-08-06T12:00:00.000Z',
        updatedAt: '2026-08-06T12:00:00.000Z',
      }],
      budgets: [{
        categoryId: 'dining',
        limitCents: 20_000,
        updatedAt: '2026-08-06T12:00:00.000Z',
      }],
    });
    expect(parseBackup(raw)).toEqual({
      transactions: [{ ...transaction, id: 'legacy-transaction' }],
      budgets: snapshot.budgets,
    });
  });

  it('rejects unknown keys and unsupported versions', () => {
    const envelope = JSON.parse(serializeBackup(snapshot, ledger));
    expect(() => parseBackup(JSON.stringify({ ...envelope, secret: true }))).toThrow('valid Finova backup');
    expect(() => parseBackup(JSON.stringify({ ...envelope, version: 2 }))).toThrow('unsupported');
  });

  it('rejects duplicate IDs and invalid minor units before replacement', () => {
    const envelope = JSON.parse(serializeBackup(snapshot, ledger));
    expect(() => parseBackup(JSON.stringify({
      ...envelope,
      transactions: [envelope.transactions[0], envelope.transactions[0]],
    }))).toThrow('Duplicate');
    expect(() => parseBackup(JSON.stringify({
      ...envelope,
      transactions: [{ ...envelope.transactions[0], amountCents: -1 }],
    }))).toThrow('amount');
  });

  it('enforces a UTF-8 byte limit before JSON parsing', () => {
    const oversized = `{"padding":"${'x'.repeat(1_048_576)}"}`;
    expect(() => parseBackup(oversized)).toThrow('1 MiB');
  });

  it('fails closed when the legacy v1 cents wire cannot represent the ledger', () => {
    expect(() => serializeBackup(snapshot, {
      ...ledger, currencyCode: 'KWD', currencyMinorUnit: 3,
    })).toThrow(/USD|version 1/i);
  });
});
