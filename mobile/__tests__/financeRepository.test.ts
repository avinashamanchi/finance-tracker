import { InMemoryFinanceRepository } from '../src/data/inMemoryFinanceRepository';
import type { FinanceSnapshot, TransactionDraft } from '../src/domain/types';

const expenseDraft: TransactionDraft = {
  kind: 'expense',
  amountCents: 2_599,
  categoryId: 'groceries',
  description: 'Weekly groceries',
  occurredOn: '2026-08-06',
  isRecurring: false,
};

describe('FinanceRepository contract', () => {
  it('initializes idempotently and supports transaction CRUD', async () => {
    const repository = new InMemoryFinanceRepository();
    await repository.initialize();
    await repository.initialize();

    const created = await repository.createTransaction(expenseDraft);
    expect(created.id).toBeTruthy();
    expect(await repository.listTransactions()).toEqual([created]);

    const updated = await repository.updateTransaction(created.id, {
      ...expenseDraft,
      amountCents: 3_100,
      description: 'Groceries and pantry',
    });
    expect(updated.amountCents).toBe(3_100);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);

    await repository.deleteTransaction(created.id);
    expect(await repository.listTransactions()).toEqual([]);
  });

  it('validates category kind, amount, description, and date before writes', async () => {
    const repository = new InMemoryFinanceRepository();
    await expect(repository.createTransaction({ ...expenseDraft, categoryId: 'salary' })).rejects.toThrow('category');
    await expect(repository.createTransaction({ ...expenseDraft, amountCents: 0 })).rejects.toThrow('amount');
    await expect(repository.createTransaction({ ...expenseDraft, description: ' ' })).rejects.toThrow('description');
    await expect(repository.createTransaction({ ...expenseDraft, occurredOn: '2026-02-30' })).rejects.toThrow('date');
  });

  it('orders transactions by date and stable creation order', async () => {
    let clock = 0;
    const repository = new InMemoryFinanceRepository({
      now: () => new Date(1_700_000_000_000 + clock++).toISOString(),
      createId: () => `id-${clock}`,
    });
    await repository.createTransaction({ ...expenseDraft, occurredOn: '2026-07-01', description: 'Older' });
    await repository.createTransaction({ ...expenseDraft, occurredOn: '2026-08-01', description: 'Newer' });
    expect((await repository.listTransactions()).map((item) => item.description)).toEqual(['Newer', 'Older']);
  });

  it('sets and clears a validated category budget', async () => {
    const repository = new InMemoryFinanceRepository();
    expect(await repository.setBudget('groceries', 40_000)).toMatchObject({
      categoryId: 'groceries',
      limitCents: 40_000,
    });
    expect(await repository.listBudgets()).toHaveLength(1);
    await repository.setBudget('groceries', 0);
    expect(await repository.listBudgets()).toEqual([]);
    await expect(repository.setBudget('salary' as 'groceries', 10)).rejects.toThrow('expense category');
  });

  it('validates an entire replacement before changing existing data', async () => {
    const repository = new InMemoryFinanceRepository();
    const original = await repository.createTransaction(expenseDraft);
    const invalid: FinanceSnapshot = {
      transactions: [{ ...original, amountCents: -1 }],
      budgets: [],
    };
    await expect(repository.replaceAll(invalid)).rejects.toThrow('amount');
    expect(await repository.listTransactions()).toEqual([original]);
  });

  it('replaces and deletes all app-owned finance rows', async () => {
    const source = new InMemoryFinanceRepository();
    const transaction = await source.createTransaction(expenseDraft);
    const budget = await source.setBudget('groceries', 50_000);
    expect(budget).toBeDefined();
    const repository = new InMemoryFinanceRepository();
    await repository.replaceAll({ transactions: [transaction], budgets: [budget!] });
    expect(await repository.snapshot()).toEqual({ transactions: [transaction], budgets: [budget!] });
    await repository.deleteAll();
    expect(await repository.snapshot()).toEqual({ transactions: [], budgets: [] });
  });
});
