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
import { currentMonth } from '../domain/summaries';
import type {
  BudgetUsage,
  FinanceSnapshot,
  Ledger,
  MonthSummary,
  MonthlyPoint,
  Transaction,
  TransactionDraft,
  TransactionKind,
} from '../domain/types';
import type { FinanceRepository, TransactionExport } from './financeRepository';
import { openFinanceRepository } from './financeRepository';
import type { TransactionCursor, TransactionQuery } from './queryTypes';
import type { PlanningRepository } from './planningRepository';
import type { RecurringRepository } from './recurringRepository';
import type { StableBackupRepository } from '../services/backupExporter';
import type { ImportableBackupRepository } from '../services/backupImporter';

const PAGE_SIZE = 50 as const;
const MAX_WINDOW = 200;

export type MonthView = Readonly<{
  summary: MonthSummary;
  budgetUsage: BudgetUsage;
  recentTransactions: readonly Transaction[];
}>;

type TransactionFilters = Readonly<{
  kinds: readonly TransactionKind[];
  search: string;
}>;

type PageBoundaries = Readonly<{
  olderCursor: TransactionCursor | null;
  newerCursor: TransactionCursor | null;
}>;

export type FinanceController = Readonly<{
  ledger: Ledger | null;
  transactions: readonly Transaction[];
  loading: boolean;
  error: string | null;
  pageError: string | null;
  loadingOlderTransactions: boolean;
  loadingNewerTransactions: boolean;
  hasOlderTransactions: boolean;
  hasNewerTransactions: boolean;
  transactionFilters: TransactionFilters;
  monthViews: Readonly<Record<string, MonthView | undefined>>;
  monthLoading: Readonly<Record<string, boolean | undefined>>;
  monthErrors: Readonly<Record<string, string | undefined>>;
  trendViews: Readonly<Record<string, readonly MonthlyPoint[] | undefined>>;
  trendLoading: Readonly<Record<string, boolean | undefined>>;
  trendErrors: Readonly<Record<string, string | undefined>>;
  reload(): Promise<void>;
  setTransactionFilters(kinds: readonly TransactionKind[], search: string): Promise<void>;
  loadOlderTransactions(): Promise<void>;
  loadNewerTransactions(): Promise<void>;
  loadMonthView(month: string): Promise<void>;
  loadTrendView(anchorMonth: string): Promise<void>;
  getTransactionById(id: string): Promise<Transaction | null>;
  createTransaction(draft: TransactionDraft): Promise<Transaction>;
  updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  setBudget(categoryId: ExpenseCategoryId, limitMinor: number, month?: string): Promise<void>;
  replaceAll(snapshot: FinanceSnapshot): Promise<void>;
  deleteAllFinanceData(): Promise<void>;
  snapshot(): Promise<FinanceSnapshot>;
  readTransactionsForCsv(): Promise<TransactionExport>;
  portability: (StableBackupRepository & ImportableBackupRepository) | null;
  refreshAfterDataReplacement(): Promise<void>;
  planningRepository: PlanningRepository | null;
  recurringRepository: RecurringRepository | null;
}>;

const FinanceContext = createContext<FinanceController | null>(null);

function portabilityRepository(
  repository: FinanceRepository,
): (StableBackupRepository & ImportableBackupRepository) | null {
  const candidate = repository as FinanceRepository & Partial<StableBackupRepository & ImportableBackupRepository>;
  return typeof candidate.withStableBackupSnapshot === 'function'
    && typeof candidate.beginBackupImport === 'function'
    ? candidate as FinanceRepository & StableBackupRepository & ImportableBackupRepository
    : null;
}

function auxiliaryRepositories(repository: FinanceRepository): Readonly<{
  planningRepository: PlanningRepository | null;
  recurringRepository: RecurringRepository | null;
}> {
  const candidate = repository as FinanceRepository & Partial<{
    createPlanningRepository(): PlanningRepository;
    createRecurringRepository(): RecurringRepository;
  }>;
  return {
    planningRepository: typeof candidate.createPlanningRepository === 'function'
      ? candidate.createPlanningRepository()
      : null,
    recurringRepository: typeof candidate.createRecurringRepository === 'function'
      ? candidate.createRecurringRepository()
      : null,
  };
}

function uniqueTransactions(transactions: readonly Transaction[]): Transaction[] {
  const seen = new Set<string>();
  return transactions.filter((transaction) => {
    if (seen.has(transaction.id)) return false;
    seen.add(transaction.id);
    return true;
  });
}

export function FinanceProvider({
  repository,
  children,
}: PropsWithChildren<{ repository: FinanceRepository }>) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [transactions, setTransactions] = useState<readonly Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [boundaries, setBoundaries] = useState<PageBoundaries>({
    olderCursor: null,
    newerCursor: null,
  });
  const [transactionFilters, setTransactionFiltersState] = useState<TransactionFilters>({
    kinds: [],
    search: '',
  });
  const [monthViews, setMonthViews] = useState<Record<string, MonthView | undefined>>({});
  const [monthLoading, setMonthLoading] = useState<Record<string, boolean | undefined>>({});
  const [monthErrors, setMonthErrors] = useState<Record<string, string | undefined>>({});
  const [trendViews, setTrendViews] = useState<Record<string, readonly MonthlyPoint[] | undefined>>({});
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean | undefined>>({});
  const [trendErrors, setTrendErrors] = useState<Record<string, string | undefined>>({});

  const mounted = useRef(true);
  const ledgerRef = useRef<Ledger | null>(null);
  const transactionsRef = useRef<readonly Transaction[]>([]);
  const boundariesRef = useRef(boundaries);
  const filtersRef = useRef(transactionFilters);
  const olderRequestInFlight = useRef(false);
  const newerRequestInFlight = useRef(false);
  const transactionGeneration = useRef(0);
  const monthGeneration = useRef<Record<string, number>>({});
  const trendGeneration = useRef<Record<string, number>>({});
  const monthViewsRef = useRef(monthViews);
  const trendViewsRef = useRef(trendViews);
  const auxiliary = useMemo(() => ledger
    ? auxiliaryRepositories(repository)
    : { planningRepository: null, recurringRepository: null }, [ledger, repository]);

  const commitTransactions = useCallback((value: readonly Transaction[]) => {
    transactionsRef.current = value;
    setTransactions(value);
  }, []);

  const commitBoundaries = useCallback((value: PageBoundaries) => {
    boundariesRef.current = value;
    setBoundaries(value);
  }, []);

  const makeQuery = useCallback((
    activeLedger: Ledger,
    filters: TransactionFilters,
    cursor?: TransactionCursor,
  ): TransactionQuery => ({
    ledgerId: activeLedger.id,
    limit: PAGE_SIZE,
    kinds: filters.kinds,
    search: filters.search,
    ...(cursor ? { cursor } : {}),
  }), []);

  const loadFirst = useCallback(async (filters = filtersRef.current) => {
    const activeLedger = ledgerRef.current;
    if (!activeLedger) return;
    const requestGeneration = ++transactionGeneration.current;
    setLoading(true);
    setError(null);
    setPageError(null);
    try {
      const page = await repository.listTransactionsPage(makeQuery(activeLedger, filters));
      if (!mounted.current || transactionGeneration.current !== requestGeneration) return;
      commitTransactions(page.items);
      commitBoundaries({ olderCursor: page.olderCursor, newerCursor: page.newerCursor });
    } catch {
      if (mounted.current && transactionGeneration.current === requestGeneration) {
        setError('Finova could not load your local data. Try again.');
      }
    } finally {
      if (mounted.current && transactionGeneration.current === requestGeneration) setLoading(false);
    }
  }, [commitBoundaries, commitTransactions, makeQuery, repository]);

  const reload = useCallback(() => loadFirst(filtersRef.current), [loadFirst]);

  useEffect(() => {
    mounted.current = true;
    const monthGenerations = monthGeneration.current;
    const trendGenerations = trendGeneration.current;
    const initializeGeneration = ++transactionGeneration.current;
    setLoading(true);
    void repository.initialize()
      .then(() => repository.getLedger())
      .then(async (value) => {
        if (!mounted.current || transactionGeneration.current !== initializeGeneration) return;
        ledgerRef.current = value;
        setLedger(value);
        await loadFirst(filtersRef.current);
      })
      .catch(() => {
        if (mounted.current) {
          setError('Finova could not open its local database. Try again.');
          setLoading(false);
        }
      });
    return () => {
      mounted.current = false;
      transactionGeneration.current += 1;
      for (const key of Object.keys(monthGenerations)) monthGenerations[key] += 1;
      for (const key of Object.keys(trendGenerations)) trendGenerations[key] += 1;
    };
  }, [loadFirst, repository]);

  const setTransactionFilters = useCallback(async (
    kinds: readonly TransactionKind[],
    search: string,
  ) => {
    const next = { kinds: [...kinds], search };
    filtersRef.current = next;
    setTransactionFiltersState(next);
    await loadFirst(next);
  }, [loadFirst]);

  const loadOlderTransactions = useCallback(async () => {
    const activeLedger = ledgerRef.current;
    const cursor = boundariesRef.current.olderCursor;
    if (!activeLedger || !cursor || olderRequestInFlight.current) return;
    olderRequestInFlight.current = true;
    const requestGeneration = transactionGeneration.current;
    const filters = filtersRef.current;
    const query = makeQuery(activeLedger, filters, cursor);
    setLoadingOlder(true);
    setPageError(null);
    try {
      const page = await repository.listTransactionsPage(query);
      if (!mounted.current || transactionGeneration.current !== requestGeneration) return;
      const currentIds = new Set(transactionsRef.current.map((transaction) => transaction.id));
      const noProgress = page.items.every((transaction) => currentIds.has(transaction.id))
        || page.olderCursor === cursor;
      let merged = uniqueTransactions([...transactionsRef.current, ...page.items]);
      let newerCursor = boundariesRef.current.newerCursor;
      if (merged.length > MAX_WINDOW) {
        merged = merged.slice(merged.length - MAX_WINDOW);
        newerCursor = await repository.createTransactionCursor(
          makeQuery(activeLedger, filters),
          'newer',
          merged[0],
        );
        if (!mounted.current || transactionGeneration.current !== requestGeneration) return;
      }
      commitTransactions(merged);
      commitBoundaries({ olderCursor: noProgress ? null : page.olderCursor, newerCursor });
      if (noProgress) {
        setPageError('Finova stopped paging because local data changed. Refresh to continue.');
      }
    } catch {
      if (mounted.current && transactionGeneration.current === requestGeneration) {
        setPageError('Finova could not load older transactions. Try again.');
      }
    } finally {
      olderRequestInFlight.current = false;
      if (mounted.current && transactionGeneration.current === requestGeneration) setLoadingOlder(false);
    }
  }, [commitBoundaries, commitTransactions, makeQuery, repository]);

  const loadNewerTransactions = useCallback(async () => {
    const activeLedger = ledgerRef.current;
    const cursor = boundariesRef.current.newerCursor;
    if (!activeLedger || !cursor || newerRequestInFlight.current) return;
    newerRequestInFlight.current = true;
    const requestGeneration = transactionGeneration.current;
    const filters = filtersRef.current;
    const query = makeQuery(activeLedger, filters, cursor);
    setLoadingNewer(true);
    setPageError(null);
    try {
      const page = await repository.listTransactionsPage(query);
      if (!mounted.current || transactionGeneration.current !== requestGeneration) return;
      const currentIds = new Set(transactionsRef.current.map((transaction) => transaction.id));
      const noProgress = page.items.every((transaction) => currentIds.has(transaction.id))
        || page.newerCursor === cursor;
      let merged = uniqueTransactions([...page.items, ...transactionsRef.current]);
      let olderCursor = boundariesRef.current.olderCursor;
      if (merged.length > MAX_WINDOW) {
        merged = merged.slice(0, MAX_WINDOW);
        olderCursor = await repository.createTransactionCursor(
          makeQuery(activeLedger, filters),
          'older',
          merged[merged.length - 1],
        );
        if (!mounted.current || transactionGeneration.current !== requestGeneration) return;
      }
      commitTransactions(merged);
      commitBoundaries({ olderCursor, newerCursor: noProgress ? null : page.newerCursor });
      if (noProgress) {
        setPageError('Finova stopped paging because local data changed. Refresh to continue.');
      }
    } catch {
      if (mounted.current && transactionGeneration.current === requestGeneration) {
        setPageError('Finova could not load newer transactions. Try again.');
      }
    } finally {
      newerRequestInFlight.current = false;
      if (mounted.current && transactionGeneration.current === requestGeneration) setLoadingNewer(false);
    }
  }, [commitBoundaries, commitTransactions, makeQuery, repository]);

  const loadMonthView = useCallback(async (month: string) => {
    const requestGeneration = (monthGeneration.current[month] ?? 0) + 1;
    monthGeneration.current[month] = requestGeneration;
    setMonthLoading((current) => ({ ...current, [month]: true }));
    setMonthErrors((current) => ({ ...current, [month]: undefined }));
    try {
      const [summary, budgetUsage, recentTransactions] = await Promise.all([
        repository.getMonthSummary(month),
        repository.getBudgetUsage(month),
        repository.getRecentTransactions(month, 4),
      ]);
      if (!mounted.current || monthGeneration.current[month] !== requestGeneration) return;
      const value = { summary, budgetUsage, recentTransactions };
      monthViewsRef.current = { ...monthViewsRef.current, [month]: value };
      setMonthViews(monthViewsRef.current);
    } catch {
      if (mounted.current && monthGeneration.current[month] === requestGeneration) {
        setMonthErrors((current) => ({
          ...current,
          [month]: 'Finova could not calculate this month safely. Try again.',
        }));
      }
    } finally {
      if (mounted.current && monthGeneration.current[month] === requestGeneration) {
        setMonthLoading((current) => ({ ...current, [month]: false }));
      }
    }
  }, [repository]);

  const loadTrendView = useCallback(async (anchorMonth: string) => {
    const requestGeneration = (trendGeneration.current[anchorMonth] ?? 0) + 1;
    trendGeneration.current[anchorMonth] = requestGeneration;
    setTrendLoading((current) => ({ ...current, [anchorMonth]: true }));
    setTrendErrors((current) => ({ ...current, [anchorMonth]: undefined }));
    try {
      const points = await repository.getSixMonthTrend(anchorMonth);
      if (!mounted.current || trendGeneration.current[anchorMonth] !== requestGeneration) return;
      trendViewsRef.current = { ...trendViewsRef.current, [anchorMonth]: points };
      setTrendViews(trendViewsRef.current);
    } catch {
      if (mounted.current && trendGeneration.current[anchorMonth] === requestGeneration) {
        setTrendErrors((current) => ({
          ...current,
          [anchorMonth]: 'Finova could not calculate this trend safely. Try again.',
        }));
      }
    } finally {
      if (mounted.current && trendGeneration.current[anchorMonth] === requestGeneration) {
        setTrendLoading((current) => ({ ...current, [anchorMonth]: false }));
      }
    }
  }, [repository]);

  const refreshLoadedViews = useCallback(async () => {
    const monthKeys = Object.keys(monthViewsRef.current);
    const trendKeys = Object.keys(trendViewsRef.current);
    await Promise.all([
      reload(),
      ...monthKeys.map((month) => loadMonthView(month)),
      ...trendKeys.map((month) => loadTrendView(month)),
    ]);
  }, [loadMonthView, loadTrendView, reload]);

  const createTransaction = useCallback(async (draft: TransactionDraft) => {
    const transaction = await repository.createTransaction(draft);
    await refreshLoadedViews();
    return transaction;
  }, [refreshLoadedViews, repository]);

  const updateTransaction = useCallback(async (id: string, draft: TransactionDraft) => {
    const transaction = await repository.updateTransaction(id, draft);
    await refreshLoadedViews();
    return transaction;
  }, [refreshLoadedViews, repository]);

  const deleteTransaction = useCallback(async (id: string) => {
    await repository.deleteTransaction(id);
    await refreshLoadedViews();
  }, [refreshLoadedViews, repository]);

  const setBudget = useCallback(async (
    categoryId: ExpenseCategoryId,
    limitMinor: number,
    month = currentMonth(),
  ) => {
    await repository.setBudget(categoryId, limitMinor, month);
    await loadMonthView(month);
  }, [loadMonthView, repository]);

  const replaceAll = useCallback(async (snapshot: FinanceSnapshot) => {
    transactionGeneration.current += 1;
    for (const key of Object.keys(monthGeneration.current)) monthGeneration.current[key] += 1;
    for (const key of Object.keys(trendGeneration.current)) trendGeneration.current[key] += 1;
    await repository.replaceAll(snapshot);
    monthViewsRef.current = {};
    trendViewsRef.current = {};
    setMonthViews({});
    setTrendViews({});
    setMonthLoading({});
    setTrendLoading({});
    setMonthErrors({});
    setTrendErrors({});
    await reload();
  }, [reload, repository]);

  const deleteAllFinanceData = useCallback(async () => {
    transactionGeneration.current += 1;
    for (const key of Object.keys(monthGeneration.current)) monthGeneration.current[key] += 1;
    for (const key of Object.keys(trendGeneration.current)) trendGeneration.current[key] += 1;
    await repository.deleteAll();
    commitTransactions([]);
    commitBoundaries({ olderCursor: null, newerCursor: null });
    monthViewsRef.current = {};
    trendViewsRef.current = {};
    setMonthViews({});
    setTrendViews({});
    setMonthLoading({});
    setTrendLoading({});
    setMonthErrors({});
    setTrendErrors({});
    setError(null);
    setPageError(null);
    setLoading(false);
  }, [commitBoundaries, commitTransactions, repository]);

  const refreshAfterDataReplacement = useCallback(async () => {
    transactionGeneration.current += 1;
    for (const key of Object.keys(monthGeneration.current)) monthGeneration.current[key] += 1;
    for (const key of Object.keys(trendGeneration.current)) trendGeneration.current[key] += 1;
    await repository.initialize();
    const nextLedger = await repository.getLedger();
    ledgerRef.current = nextLedger;
    setLedger(nextLedger);
    monthViewsRef.current = {};
    trendViewsRef.current = {};
    setMonthViews({});
    setTrendViews({});
    setMonthLoading({});
    setTrendLoading({});
    setMonthErrors({});
    setTrendErrors({});
    await loadFirst(filtersRef.current);
  }, [loadFirst, repository]);

  const value = useMemo<FinanceController>(() => ({
    ledger,
    transactions,
    loading,
    error,
    pageError,
    loadingOlderTransactions: loadingOlder,
    loadingNewerTransactions: loadingNewer,
    hasOlderTransactions: boundaries.olderCursor !== null,
    hasNewerTransactions: boundaries.newerCursor !== null,
    transactionFilters,
    monthViews,
    monthLoading,
    monthErrors,
    trendViews,
    trendLoading,
    trendErrors,
    reload,
    setTransactionFilters,
    loadOlderTransactions,
    loadNewerTransactions,
    loadMonthView,
    loadTrendView,
    getTransactionById: (id) => repository.getTransactionById(id),
    createTransaction,
    updateTransaction,
    deleteTransaction,
    setBudget,
    replaceAll,
    deleteAllFinanceData,
    snapshot: () => repository.snapshot(),
    readTransactionsForCsv: () => repository.readTransactionsForCsv(),
    portability: portabilityRepository(repository),
    refreshAfterDataReplacement,
    planningRepository: auxiliary.planningRepository,
    recurringRepository: auxiliary.recurringRepository,
  }), [
    boundaries,
    auxiliary,
    createTransaction,
    deleteAllFinanceData,
    deleteTransaction,
    error,
    ledger,
    loadMonthView,
    loadNewerTransactions,
    loadOlderTransactions,
    loadTrendView,
    loading,
    loadingNewer,
    loadingOlder,
    monthErrors,
    monthLoading,
    monthViews,
    pageError,
    reload,
    replaceAll,
    repository,
    refreshAfterDataReplacement,
    setBudget,
    setTransactionFilters,
    transactionFilters,
    transactions,
    trendErrors,
    trendLoading,
    trendViews,
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
