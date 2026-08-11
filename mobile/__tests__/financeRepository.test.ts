import { InMemoryFinanceRepository } from '../src/data/inMemoryFinanceRepository';
import { BackupScaleUnavailableError, ExportScaleUnavailableError, LedgerCapacityError } from '../src/domain/errors';
import type { FinanceSnapshot, TransactionDraft } from '../src/domain/types';

const expenseDraft: TransactionDraft = {
  kind: 'expense',
  amountMinor: 2_599,
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
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const ledger = await repository.getLedger();
    expect(ledger).toMatchObject({ currencyCode: 'USD', currencyMinorUnit: 2 });
    expect((await repository.listTransactionsPage({
      ledgerId: ledger.id, limit: 50, kinds: [], search: '',
    })).items).toEqual([created]);
    expect(await repository.getTransactionById(created.id)).toEqual(created);

    const updated = await repository.updateTransaction(created.id, {
      ...expenseDraft,
      amountMinor: 3_100,
      description: 'Groceries and pantry',
    });
    expect(updated.amountMinor).toBe(3_100);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);

    await repository.deleteTransaction(created.id);
    expect(await repository.getTransactionById(created.id)).toBeNull();
  });

  it('validates category kind, amount, description, and date before writes', async () => {
    const repository = new InMemoryFinanceRepository();
    await expect(repository.createTransaction({ ...expenseDraft, categoryId: 'salary' })).rejects.toThrow('category');
    await expect(repository.createTransaction({ ...expenseDraft, amountMinor: 0 })).rejects.toThrow('amount');
    await expect(repository.createTransaction({ ...expenseDraft, description: ' ' })).rejects.toThrow('description');
    await expect(repository.createTransaction({ ...expenseDraft, occurredOn: '2026-02-30' })).rejects.toThrow('date');
  });

  it('orders transactions by date and stable creation order', async () => {
    let clock = 0;
    const ids = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
    ];
    const repository = new InMemoryFinanceRepository({
      now: () => new Date(1_700_000_000_000 + clock++).toISOString(),
      createId: () => ids.shift()!,
    });
    await repository.createTransaction({ ...expenseDraft, occurredOn: '2026-07-01', description: 'Older' });
    await repository.createTransaction({ ...expenseDraft, occurredOn: '2026-08-01', description: 'Newer' });
    const ledger = await repository.getLedger();
    expect((await repository.listTransactionsPage({
      ledgerId: ledger.id, limit: 50, kinds: [], search: '',
    })).items.map((item) => item.description)).toEqual(['Newer', 'Older']);
  });

  it('sets and clears a validated category budget', async () => {
    const repository = new InMemoryFinanceRepository();
    expect(await repository.setBudget('groceries', 40_000)).toMatchObject({
      categoryId: 'groceries',
      limitMinor: 40_000,
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
      transactions: [{ ...original, amountMinor: -1 }],
      budgets: [],
    };
    await expect(repository.replaceAll(invalid)).rejects.toThrow('amount');
    expect(await repository.getTransactionById(original.id)).toEqual(original);
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

  it('uses exact keyed aggregates instead of deriving totals from the visible page', async () => {
    const repository = new InMemoryFinanceRepository();
    await repository.replaceAll({
      transactions: [
        {
          id: 'legacy-income', ...expenseDraft, kind: 'income', categoryId: 'salary',
          amountMinor: 10_000, description: 'Income', createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'legacy-expense', ...expenseDraft, amountMinor: 2_500,
          createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
        },
      ],
      budgets: [{ categoryId: 'groceries', limitMinor: 5_000, updatedAt: '2026-08-01T00:00:00.000Z' }],
    });
    expect(await repository.getMonthSummary('2026-08')).toMatchObject({
      incomeMinor: 10_000, expenseMinor: 2_500, balanceMinor: 7_500,
    });
    expect(await repository.getBudgetUsage('2026-08')).toMatchObject({
      totalLimitMinor: 5_000,
      expenseByCategory: { groceries: 2_500 },
    });
    expect(await repository.getSixMonthTrend('2026-08')).toHaveLength(6);
  });

  it('fails closed before producing oversized interim exports or v1 backups', async () => {
    const build = (count: number): FinanceSnapshot => ({
      transactions: Array.from({ length: count }, (_, index) => ({
        id: `legacy-${index}`,
        ...expenseDraft,
        description: `Row ${index}`,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      })),
      budgets: [],
    });
    const repository = new InMemoryFinanceRepository();
    await repository.replaceAll(build(501));
    await expect(repository.readTransactionsForCsv()).rejects.toBeInstanceOf(ExportScaleUnavailableError);
    await repository.replaceAll(build(10_001));
    await expect(repository.snapshot()).rejects.toBeInstanceOf(BackupScaleUnavailableError);
  });

  it('enforces the technical transaction cap while retaining reads and deletes', async () => {
    const repository = new InMemoryFinanceRepository();
    const transaction = {
      id: 'legacy', ...expenseDraft,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const oversized = Array.from({ length: 100_001 }, (_, index) => ({
      ...transaction, id: `legacy-${index}`,
    }));
    await expect(repository.replaceAll({ transactions: oversized, budgets: [] }))
      .rejects.toBeInstanceOf(LedgerCapacityError);
    await repository.replaceAll({ transactions: oversized.slice(0, 100_000), budgets: [] });
    await expect(repository.createTransaction(expenseDraft)).rejects.toBeInstanceOf(LedgerCapacityError);
    await repository.deleteTransaction('legacy-0');
    await expect(repository.createTransaction(expenseDraft)).resolves.toBeDefined();
  });
});
