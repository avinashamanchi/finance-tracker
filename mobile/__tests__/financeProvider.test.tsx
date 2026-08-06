import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { FinanceProvider, useFinance } from '../src/data/FinanceProvider';
import { InMemoryFinanceRepository } from '../src/data/inMemoryFinanceRepository';
import type { Transaction } from '../src/domain/types';

const draft = {
  kind: 'income' as const,
  amountCents: 100_000,
  categoryId: 'salary' as const,
  description: 'Paycheck',
  occurredOn: '2026-08-01',
  isRecurring: true,
};

class DeferredListRepository extends InMemoryFinanceRepository {
  deferred?: { promise: Promise<Transaction[]>; resolve: (value: Transaction[]) => void };

  deferNextList() {
    let resolve!: (value: Transaction[]) => void;
    const promise = new Promise<Transaction[]>((done) => { resolve = done; });
    this.deferred = { promise, resolve };
    return this.deferred;
  }

  override async listTransactions(): Promise<Transaction[]> {
    if (this.deferred) {
      const deferred = this.deferred;
      this.deferred = undefined;
      return deferred.promise;
    }
    return super.listTransactions();
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
      deferred.resolve([old]);
      await reload;
    });
    expect(result.current.transactions).toEqual([]);
  });

  it('fails clearly outside the provider boundary', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    function Consumer() { useFinance(); return null; }
    const screen = await render(<TestErrorBoundary><Consumer /></TestErrorBoundary>);
    expect(screen.getByText(/FinanceProvider/)).toBeTruthy();
    consoleError.mockRestore();
  });
});
