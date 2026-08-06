import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../design/tokens';
import type { ExpenseCategoryId } from '../domain/categories';
import type { Budget, FinanceSnapshot, Transaction, TransactionDraft } from '../domain/types';
import type { FinanceRepository } from './financeRepository';
import { openFinanceRepository } from './financeRepository';

export type FinanceController = Readonly<{
  transactions: Transaction[];
  budgets: Budget[];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  createTransaction(draft: TransactionDraft): Promise<Transaction>;
  updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  setBudget(categoryId: ExpenseCategoryId, limitCents: number): Promise<void>;
  replaceAll(snapshot: FinanceSnapshot): Promise<void>;
  deleteAllFinanceData(): Promise<void>;
  snapshot(): Promise<FinanceSnapshot>;
}>;

const FinanceContext = createContext<FinanceController | null>(null);

export function FinanceProvider({
  repository,
  children,
}: PropsWithChildren<{ repository: FinanceRepository }>) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [nextTransactions, nextBudgets] = await Promise.all([
        repository.listTransactions(),
        repository.listBudgets(),
      ]);
      if (generation.current !== requestGeneration) return;
      setTransactions(nextTransactions);
      setBudgets(nextBudgets);
    } catch {
      if (generation.current === requestGeneration) {
        setError('Finova could not load your local data. Try again.');
      }
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    void repository.initialize()
      .then(() => {
        if (active) return reload();
      })
      .catch(() => {
        if (active) {
          setError('Finova could not open its local database. Try again.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [reload, repository]);

  const createTransaction = useCallback(async (draft: TransactionDraft) => {
    const transaction = await repository.createTransaction(draft);
    await reload();
    return transaction;
  }, [reload, repository]);

  const updateTransaction = useCallback(async (id: string, draft: TransactionDraft) => {
    const transaction = await repository.updateTransaction(id, draft);
    await reload();
    return transaction;
  }, [reload, repository]);

  const deleteTransaction = useCallback(async (id: string) => {
    await repository.deleteTransaction(id);
    await reload();
  }, [reload, repository]);

  const setBudget = useCallback(async (categoryId: ExpenseCategoryId, limitCents: number) => {
    await repository.setBudget(categoryId, limitCents);
    await reload();
  }, [reload, repository]);

  const replaceAll = useCallback(async (snapshot: FinanceSnapshot) => {
    generation.current += 1;
    await repository.replaceAll(snapshot);
    await reload();
  }, [reload, repository]);

  const deleteAllFinanceData = useCallback(async () => {
    generation.current += 1;
    await repository.deleteAll();
    setTransactions([]);
    setBudgets([]);
    setError(null);
    setLoading(false);
  }, [repository]);

  const value = useMemo<FinanceController>(() => ({
    transactions,
    budgets,
    loading,
    error,
    reload,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    setBudget,
    replaceAll,
    deleteAllFinanceData,
    snapshot: () => repository.snapshot(),
  }), [
    budgets,
    createTransaction,
    deleteAllFinanceData,
    deleteTransaction,
    error,
    loading,
    reload,
    replaceAll,
    repository,
    setBudget,
    transactions,
    updateTransaction,
  ]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function SQLiteFinanceProvider({ children }: PropsWithChildren) {
  const [repository, setRepository] = useState<FinanceRepository | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void openFinanceRepository()
      .then((value) => active && setRepository(value))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, []);

  if (failed) {
    return <View style={providerStyles.center}><Text accessibilityRole="alert" style={providerStyles.error}>Finova could not open its local database. Close and reopen the app to try again.</Text></View>;
  }
  if (!repository) {
    return <View style={providerStyles.center}><ActivityIndicator accessibilityLabel="Opening local Finova database" color={colors.jade} /></View>;
  }
  return <FinanceProvider repository={repository}>{children}</FinanceProvider>;
}

export function useFinance(): FinanceController {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance must be used within FinanceProvider.');
  return value;
}

const providerStyles = StyleSheet.create({
  center: { alignItems: 'center', backgroundColor: colors.ink, flex: 1, justifyContent: 'center', padding: spacing.lg },
  error: { color: colors.coral, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
