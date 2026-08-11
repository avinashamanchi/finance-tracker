import * as Crypto from 'expo-crypto';
import type { ExpenseCategoryId } from '../domain/categories';
import { getCategory } from '../domain/categories';
import {
  BackupScaleUnavailableError,
  DataBoundaryError,
  ExportScaleUnavailableError,
  InvalidCursorError,
  LedgerCapacityError,
} from '../domain/errors';
import { addMinorExact } from '../domain/money';
import { buildSixMonthTrend, currentMonth, summarizeMonth } from '../domain/summaries';
import type {
  Budget,
  BudgetUsage,
  FinanceSnapshot,
  Ledger,
  MonthSummary,
  MonthlyPoint,
  Transaction,
  TransactionDraft,
} from '../domain/types';
import type { FinanceRepository, TransactionExport } from './financeRepository';
import type {
  CursorDirection,
  TransactionCursor,
  TransactionEdge,
  TransactionPage,
  TransactionQuery,
} from './queryTypes';
import { normalizeTransactionFilters } from './transactionQueries';
import {
  MAX_LEDGER_TRANSACTIONS,
  isUuidV4,
  isValidTransactionId,
  sortTransactions,
  validateBudgetAmount,
  validateDraft,
  validateSnapshot,
  validateTransaction,
} from './validation';

type Options = Readonly<{
  now?: () => string;
  createId?: () => string;
  ledger?: Ledger;
}>;

type StoredBudget = Readonly<{ month: string; budget: Budget }>;

type MemoryCursor = Readonly<{
  direction: CursorDirection;
  edge: TransactionEdge;
  ledgerId: string;
  kinds: readonly string[];
  search: string;
}>;

const DEFAULT_LEDGER: Ledger = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Personal',
  currencyCode: 'USD',
  currencyMinorUnit: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let fallbackMemoryId = 0;

function fallbackUuid(): string {
  fallbackMemoryId += 1;
  return `00000000-0000-4000-8000-${fallbackMemoryId.toString(16).padStart(12, '0')}`;
}

function cloneTransaction(transaction: Transaction): Transaction {
  return { ...transaction };
}

function monthForIso(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Finova clock returned an invalid date.');
  return currentMonth(date);
}

function encodeCursor(cursor: MemoryCursor): TransactionCursor {
  return JSON.stringify(cursor) as TransactionCursor;
}

function decodeCursor(value: TransactionCursor): MemoryCursor {
  try {
    const candidate = JSON.parse(value) as Partial<MemoryCursor>;
    if (!candidate || typeof candidate !== 'object'
      || (candidate.direction !== 'older' && candidate.direction !== 'newer')
      || typeof candidate.ledgerId !== 'string'
      || typeof candidate.search !== 'string'
      || !Array.isArray(candidate.kinds)
      || !candidate.edge
      || typeof candidate.edge.id !== 'string'
      || typeof candidate.edge.occurredOn !== 'string'
      || typeof candidate.edge.createdAt !== 'string') {
      throw new InvalidCursorError();
    }
    return candidate as MemoryCursor;
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
}

export class InMemoryFinanceRepository implements FinanceRepository {
  private transactions: Transaction[] = [];
  private storedBudgets: StoredBudget[] = [];
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly ledger: Ledger;

  constructor(options: Options = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => Crypto.randomUUID?.() ?? fallbackUuid());
    this.ledger = { ...(options.ledger ?? DEFAULT_LEDGER) };
  }

  async initialize(): Promise<void> {}

  async getLedger(): Promise<Ledger> {
    return { ...this.ledger };
  }

  async createTransactionCursor(
    query: TransactionQuery,
    direction: CursorDirection,
    edge: TransactionEdge,
  ): Promise<TransactionCursor> {
    const filters = normalizeTransactionFilters(query);
    if (query.ledgerId !== this.ledger.id) throw new InvalidCursorError();
    return encodeCursor({
      direction,
      edge: { ...edge },
      ledgerId: query.ledgerId,
      kinds: filters.kinds,
      search: filters.normalizedSearch,
    });
  }

  async listTransactionsPage(query: TransactionQuery): Promise<TransactionPage> {
    const filters = normalizeTransactionFilters(query);
    if (query.ledgerId !== this.ledger.id) throw new InvalidCursorError();
    const categoryMatches = (transaction: Transaction) => {
      const searchable = `${transaction.description} ${getCategory(transaction.categoryId)?.label ?? ''} ${transaction.categoryId}`
        .normalize('NFKC')
        .toLocaleLowerCase('en-US');
      return filters.searchTokens.every((token) => searchable.includes(token));
    };
    const all = sortTransactions(this.transactions).filter((transaction) => (
      (filters.kinds.length === 0 || filters.kinds.includes(transaction.kind))
      && (filters.searchTokens.length === 0 || categoryMatches(transaction))
    ));
    let direction: CursorDirection | null = null;
    let edgeIndex = -1;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (cursor.ledgerId !== query.ledgerId
        || cursor.search !== filters.normalizedSearch
        || JSON.stringify(cursor.kinds) !== JSON.stringify(filters.kinds)) {
        throw new InvalidCursorError();
      }
      direction = cursor.direction;
      edgeIndex = all.findIndex((transaction) => (
        transaction.id === cursor.edge.id
        && transaction.occurredOn === cursor.edge.occurredOn
        && transaction.createdAt === cursor.edge.createdAt
      ));
      if (edgeIndex < 0) throw new InvalidCursorError();
    }

    let items: Transaction[];
    let hasOlder: boolean;
    let hasNewer: boolean;
    if (!direction) {
      items = all.slice(0, query.limit);
      hasOlder = all.length > query.limit;
      hasNewer = false;
    } else if (direction === 'older') {
      items = all.slice(edgeIndex + 1, edgeIndex + 1 + query.limit);
      hasOlder = edgeIndex + 1 + items.length < all.length;
      hasNewer = items.length > 0;
    } else {
      const start = Math.max(0, edgeIndex - query.limit);
      items = all.slice(start, edgeIndex);
      hasOlder = items.length > 0;
      hasNewer = start > 0;
    }
    const olderCursor = hasOlder && items.length > 0
      ? await this.createTransactionCursor(query, 'older', items[items.length - 1])
      : null;
    const newerCursor = hasNewer && items.length > 0
      ? await this.createTransactionCursor(query, 'newer', items[0])
      : null;
    return {
      items: items.map(cloneTransaction),
      olderCursor,
      newerCursor,
      hasOlder,
      hasNewer,
    };
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    if (!isValidTransactionId(id)) throw new DataBoundaryError();
    const transaction = this.transactions.find((item) => item.id === id);
    return transaction ? cloneTransaction(transaction) : null;
  }

  async createTransaction(draft: TransactionDraft): Promise<Transaction> {
    const valid = validateDraft(draft);
    if (this.transactions.length >= MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
    const now = this.now();
    const id = this.createId();
    if (!isUuidV4(id)) throw new Error('Finova could not create a transaction identifier.');
    const transaction = validateTransaction({
      ...valid,
      id,
      createdAt: now,
      updatedAt: now,
    });
    this.transactions = [transaction, ...this.transactions];
    return cloneTransaction(transaction);
  }

  async updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction> {
    if (!isValidTransactionId(id)) throw new DataBoundaryError();
    const index = this.transactions.findIndex((transaction) => transaction.id === id);
    if (index < 0) throw new Error('Transaction not found.');
    const valid = validateDraft(draft);
    const transaction = validateTransaction({
      ...this.transactions[index],
      ...valid,
      updatedAt: this.now(),
    });
    this.transactions = this.transactions.map((item) => item.id === id ? transaction : item);
    return cloneTransaction(transaction);
  }

  async deleteTransaction(id: string): Promise<void> {
    if (!isValidTransactionId(id)) throw new DataBoundaryError();
    this.transactions = this.transactions.filter((transaction) => transaction.id !== id);
  }

  async listBudgets(month = monthForIso(this.now())): Promise<Budget[]> {
    return this.storedBudgets
      .filter((entry) => entry.month === month)
      .map((entry) => entry.budget)
      .sort((left, right) => left.categoryId.localeCompare(right.categoryId))
      .map((budget) => ({ ...budget }));
  }

  async setBudget(
    categoryId: ExpenseCategoryId,
    limitMinor: number,
    month = monthForIso(this.now()),
  ): Promise<Budget | undefined> {
    validateBudgetAmount(categoryId, limitMinor);
    this.storedBudgets = this.storedBudgets.filter((entry) => (
      entry.month !== month || entry.budget.categoryId !== categoryId
    ));
    if (limitMinor === 0) return undefined;
    const budget: Budget = { categoryId, limitMinor, updatedAt: this.now() };
    this.storedBudgets.push({ month, budget });
    return { ...budget };
  }

  async getMonthSummary(month: string): Promise<MonthSummary> {
    if (this.transactions.length > MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
    return summarizeMonth(this.transactions, month);
  }

  async getSixMonthTrend(anchorMonth: string): Promise<MonthlyPoint[]> {
    if (this.transactions.length > MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
    return buildSixMonthTrend(this.transactions, anchorMonth);
  }

  async getRecentTransactions(month: string, limit = 4): Promise<readonly Transaction[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid recent transaction limit.');
    return sortTransactions(this.transactions)
      .filter((transaction) => transaction.occurredOn.startsWith(`${month}-`))
      .slice(0, limit)
      .map(cloneTransaction);
  }

  async getBudgetUsage(month: string): Promise<BudgetUsage> {
    const [budgets, summary] = await Promise.all([
      this.listBudgets(month),
      this.getMonthSummary(month),
    ]);
    return {
      month,
      budgets,
      expenseByCategory: { ...summary.expenseByCategory },
      totalLimitMinor: addMinorExact(budgets.map((budget) => budget.limitMinor)),
    };
  }

  async readTransactionsForCsv(): Promise<TransactionExport> {
    const transactions = sortTransactions(this.transactions);
    if (transactions.length > 500) throw new ExportScaleUnavailableError();
    return { ledger: { ...this.ledger }, transactions: transactions.map(cloneTransaction) };
  }

  async snapshot(): Promise<FinanceSnapshot> {
    if (this.transactions.length > 10_000) throw new BackupScaleUnavailableError();
    return {
      transactions: sortTransactions(this.transactions).map(cloneTransaction),
      budgets: await this.listBudgets(),
    };
  }

  async replaceAll(snapshot: FinanceSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot);
    const month = monthForIso(this.now());
    this.transactions = valid.transactions.map(cloneTransaction);
    this.storedBudgets = valid.budgets.map((budget) => ({ month, budget: { ...budget } }));
  }

  async deleteAll(): Promise<void> {
    this.transactions = [];
    this.storedBudgets = [];
  }
}
