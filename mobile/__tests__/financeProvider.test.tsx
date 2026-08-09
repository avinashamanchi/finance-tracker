import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { FinanceProvider, useFinance } from '../src/data/FinanceProvider';
import { InMemoryFinanceRepository } from '../src/data/inMemoryFinanceRepository';
import type { MonthSummary, Transaction } from '../src/domain/types';
import type { TransactionPage, TransactionQuery } from '../src/data/queryTypes';

const draft = {
  kind: 'income' as const,
  amountMinor: 100_000,
  categoryId: 'salary' as const,
  description: 'Paycheck',
  occurredOn: '2026-08-01',
  isRecurring: true,
};

class DeferredListRepository extends InMemoryFinanceRepository {
  deferred?: { promise: Promise<TransactionPage>; resolve: (value: TransactionPage) => void };

  deferNextList() {
    let resolve!: (value: TransactionPage) => void;
    const promise = new Promise<TransactionPage>((done) => { resolve = done; });
    this.deferred = { promise, resolve };
    return this.deferred;
  }

  override async listTransactionsPage(query: TransactionQuery): Promise<TransactionPage> {
    if (this.deferred) {
      const deferred = this.deferred;
      this.deferred = undefined;
      return deferred.promise;
    }
    return super.listTransactionsPage(query);
  }
}

class DeferredMonthRepository extends InMemoryFinanceRepository {
  deferred?: { promise: Promise<MonthSummary>; resolve: (value: MonthSummary) => void };

  deferNextSummary() {
    let resolve!: (value: MonthSummary) => void;
    const promise = new Promise<MonthSummary>((done) => { resolve = done; });
    this.deferred = { promise, resolve };
    return this.deferred;
  }

  override async getMonthSummary(month: string): Promise<MonthSummary> {
    if (this.deferred) {
      const deferred = this.deferred;
      this.deferred = undefined;
      return deferred.promise;
    }
    return super.getMonthSummary(month);
  }
}

class RepeatingPageRepository extends InMemoryFinanceRepository {
  repeatedCalls = 0;

  override async listTransactionsPage(query: TransactionQuery): Promise<TransactionPage> {
    if (!query.cursor) return super.listTransactionsPage(query);
    this.repeatedCalls += 1;
    const first = await super.listTransactionsPage({ ...query, cursor: undefined });
    return {
      items: first.items,
      olderCursor: query.cursor,
      newerCursor: first.newerCursor,
      hasOlder: true,
      hasNewer: false,
    };
  }
}

class TestErrorBoundary extends Component<PropsWithChildren, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    return this.state.message ? <Text>{this.state.message}</Text> : this.props.children;
  }
}

describe('FinanceProvider', () => {
  it('loads and publishes repository mutations', async () => {
    const repository = new InMemoryFinanceRepository();
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.createTransaction(draft); });
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].description).toBe('Paycheck');
  });

  it('does not let a stale reload restore rows after deletion', async () => {
    const repository = new DeferredListRepository();
    const old = await repository.createTransaction(draft);
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    const deferred = repository.deferNextList();
    let reload!: Promise<void>;
    await act(() => { reload = result.current.reload(); });
    await act(async () => { await result.current.deleteAllFinanceData(); });
    expect(result.current.transactions).toEqual([]);

    await act(async () => {
      deferred.resolve({
        items: [old], olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false,
      });
      await reload;
    });
    expect(result.current.transactions).toEqual([]);
  });

  it('keeps a bidirectional transaction window bounded to 200 rows', async () => {
    const repository = new InMemoryFinanceRepository();
    const transactions = Array.from({ length: 250 }, (_, index): Transaction => ({
      id: `legacy-${String(index).padStart(4, '0')}`,
      kind: 'expense', amountMinor: index + 1, categoryId: 'groceries',
      description: `Row ${index}`, occurredOn: '2026-08-01', isRecurring: false,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    }));
    await repository.replaceAll({ transactions, budgets: [] });
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.transactions).toHaveLength(50));
    for (let page = 0; page < 4; page += 1) {
      await act(async () => { await result.current.loadOlderTransactions(); });
    }
    expect(result.current.transactions).toHaveLength(200);
    expect(result.current.hasNewerTransactions).toBe(true);
    await act(async () => { await result.current.loadNewerTransactions(); });
    expect(result.current.transactions.length).toBeLessThanOrEqual(200);
    expect(new Set(result.current.transactions.map((item) => item.id)).size)
      .toBe(result.current.transactions.length);
  });

  it('loads keyed SQL-style summaries independently of the visible page', async () => {
    const repository = new InMemoryFinanceRepository();
    await repository.replaceAll({
      transactions: Array.from({ length: 75 }, (_, index): Transaction => ({
        id: `legacy-${index}`, kind: 'income', amountMinor: 100, categoryId: 'salary',
        description: `Income ${index}`, occurredOn: '2026-08-01', isRecurring: false,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })),
      budgets: [],
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.transactions).toHaveLength(50));
    await act(async () => { await result.current.loadMonthView('2026-08'); });
    expect(result.current.monthViews['2026-08']?.summary).toMatchObject({
      transactionCount: 75,
      incomeMinor: 7_500,
    });
  });

  it('never uses snapshot export as a normal mutation reload path', async () => {
    const repository = new InMemoryFinanceRepository();
    const snapshot = jest.spyOn(repository, 'snapshot');
    const csv = jest.spyOn(repository, 'readTransactionsForCsv');
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.createTransaction(draft); });
    expect(snapshot).not.toHaveBeenCalled();
    expect(csv).not.toHaveBeenCalled();
  });

  it('does not let a stale keyed aggregate overwrite a newer month result', async () => {
    const repository = new DeferredMonthRepository();
    const original: Transaction = {
      id: 'old', kind: 'income', amountMinor: 100, categoryId: 'salary',
      description: 'Old', occurredOn: '2026-08-01', isRecurring: false,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    };
    await repository.replaceAll({ transactions: [original], budgets: [] });
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const deferred = repository.deferNextSummary();
    let stale!: Promise<void>;
    await act(() => { stale = result.current.loadMonthView('2026-08'); });
    await repository.replaceAll({ transactions: [{ ...original, id: 'new', amountMinor: 500 }], budgets: [] });
    await act(async () => { await result.current.loadMonthView('2026-08'); });
    expect(result.current.monthViews['2026-08']?.summary.incomeMinor).toBe(500);
    await act(async () => {
      deferred.resolve({
        month: '2026-08', incomeMinor: 100, expenseMinor: 0, balanceMinor: 100,
        savingsRatePercent: 100, transactionCount: 1, expenseByCategory: {},
      });
      await stale;
    });
    expect(result.current.monthViews['2026-08']?.summary.incomeMinor).toBe(500);
  });

  it('coalesces concurrent paging and terminates a repeated no-progress cursor', async () => {
    const repository = new RepeatingPageRepository();
    await repository.replaceAll({
      transactions: Array.from({ length: 51 }, (_, index): Transaction => ({
        id: `repeat-${index}`, kind: 'expense', amountMinor: 1, categoryId: 'groceries',
        description: `Repeat ${index}`, occurredOn: '2026-08-01', isRecurring: false,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })),
      budgets: [],
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <FinanceProvider repository={repository}>{children}</FinanceProvider>
    );
    const { result } = await renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hasOlderTransactions).toBe(true));
    await act(async () => {
      await Promise.all([
        result.current.loadOlderTransactions(),
        result.current.loadOlderTransactions(),
      ]);
    });
    expect(repository.repeatedCalls).toBe(1);
    expect(result.current.transactions).toHaveLength(50);
    expect(result.current.hasOlderTransactions).toBe(false);
  });

  it('fails clearly outside the provider boundary', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    function Consumer() { useFinance(); return null; }
    const screen = await render(<TestErrorBoundary><Consumer /></TestErrorBoundary>);
    expect(screen.getByText(/FinanceProvider/)).toBeTruthy();
    consoleError.mockRestore();
  });
});
