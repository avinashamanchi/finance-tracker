import type { Transaction, TransactionKind } from '../domain/types';

export type TransactionCursor = string & {
  readonly __transactionCursor: unique symbol;
};

export type TransactionPageLimit = 1 | 10 | 25 | 50;

export type TransactionQuery = Readonly<{
  ledgerId: string;
  limit: TransactionPageLimit;
  kinds: readonly TransactionKind[];
  search: string;
  cursor?: TransactionCursor;
}>;

export type TransactionEdge = Pick<Transaction, 'id' | 'occurredOn' | 'createdAt'>;

export type TransactionPage = Readonly<{
  items: readonly Transaction[];
  olderCursor: TransactionCursor | null;
  newerCursor: TransactionCursor | null;
  hasOlder: boolean;
  hasNewer: boolean;
}>;

export type CursorDirection = 'older' | 'newer';

export type NormalizedTransactionFilters = Readonly<{
  kinds: readonly TransactionKind[];
  normalizedSearch: string;
  searchTokens: readonly string[];
  ftsExpression: string | null;
}>;
