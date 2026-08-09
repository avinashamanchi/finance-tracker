import * as Crypto from 'expo-crypto';
import { ALL_CATEGORIES } from '../domain/categories';
import { DataBoundaryError, InvalidCursorError } from '../domain/errors';
import type { Transaction, TransactionKind } from '../domain/types';
import type { MigrationDatabase } from './migrations/types';
import type {
  CursorDirection,
  NormalizedTransactionFilters,
  TransactionCursor,
  TransactionEdge,
  TransactionPage,
  TransactionQuery,
} from './queryTypes';
import {
  hasUnpairedSurrogate,
  isCanonicalUuid,
  isValidDateKey,
  isValidIsoTimestamp,
  isValidTransactionId,
  validateTransaction,
} from './validation';

const CURSOR_MAX_LENGTH = 1024;
const CURSOR_VERSION = 1;
const PAGE_LIMITS = new Set([1, 10, 25, 50]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const HEX_64 = /^[0-9a-f]{64}$/;

type Digest = (value: string) => Promise<string>;
type QueryOptions = Readonly<{ salt?: string; digest?: Digest }>;

type TransactionRow = Readonly<{
  id: string;
  kind: 'income' | 'expense';
  amount_minor: number;
  category_id: Transaction['categoryId'];
  description: string;
  occurred_on: string;
  is_recurring: number;
  created_at: string;
  updated_at: string;
}>;

type CursorPayload = Readonly<{
  v: 1;
  d: CursorDirection;
  l: string;
  f: string;
  e: Readonly<{ o: string; c: string; i: string }>;
}>;

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function utf8Encode(value: string): Uint8Array {
  if (hasUnpairedSurrogate(value)) throw new InvalidCursorError();
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  try {
    if (typeof TextDecoder !== 'undefined') {
      const result = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (hasUnpairedSurrogate(result)) throw new InvalidCursorError();
      return result;
    }
    let encoded = '';
    for (const byte of bytes) encoded += `%${byte.toString(16).padStart(2, '0')}`;
    const result = decodeURIComponent(encoded);
    if (hasUnpairedSurrogate(result)) throw new InvalidCursorError();
    return result;
  } catch {
    throw new InvalidCursorError();
  }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const value = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(value >>> 18) & 63];
    output += BASE64_ALPHABET[(value >>> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(value >>> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64_ALPHABET[value & 63] : '=';
  }
  return output.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || value.length > CURSOR_MAX_LENGTH || !BASE64URL.test(value)) {
    throw new InvalidCursorError();
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    + '='.repeat((4 - value.length % 4) % 4);
  const bytes: number[] = [];
  for (let index = 0; index < padded.length; index += 4) {
    const values = Array.from(padded.slice(index, index + 4), (character) => (
      character === '=' ? 0 : BASE64_ALPHABET.indexOf(character)
    ));
    if (values.some((item, itemIndex) => item < 0 && padded[index + itemIndex] !== '=')) {
      throw new InvalidCursorError();
    }
    const combined = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    bytes.push((combined >>> 16) & 255);
    if (padded[index + 2] !== '=') bytes.push((combined >>> 8) & 255);
    if (padded[index + 3] !== '=') bytes.push(combined & 255);
  }
  const result = Uint8Array.from(bytes);
  if (encodeBase64Url(result) !== value) throw new InvalidCursorError();
  return result;
}

function constantEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index % Math.max(1, left.length)) || 0)
      ^ (right.charCodeAt(index % Math.max(1, right.length)) || 0);
  }
  return difference === 0;
}

function normalizeTokenText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

export function normalizeTransactionFilters(query: TransactionQuery): NormalizedTransactionFilters {
  if (!isCanonicalUuid(query.ledgerId) || !PAGE_LIMITS.has(query.limit)) {
    throw new DataBoundaryError();
  }
  if (hasUnpairedSurrogate(query.search) || Array.from(query.search).length > 80) {
    throw new DataBoundaryError();
  }
  const invalidKind = query.kinds.some((kind) => kind !== 'income' && kind !== 'expense');
  if (invalidKind) throw new DataBoundaryError();
  const kinds = [...new Set(query.kinds)].sort() as TransactionKind[];
  const normalizedSearch = normalizeTokenText(query.search).trim();
  const searchTokens = normalizedSearch.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (searchTokens.length > 8) throw new DataBoundaryError();
  if (searchTokens.length === 0) {
    return { kinds, normalizedSearch: '', searchTokens: [], ftsExpression: null };
  }
  const tokenExpression = searchTokens.map((token) => `"${token}"*`).join(' AND ');
  const categoryIds = ALL_CATEGORIES.filter((category) => {
    const searchable = `${normalizeTokenText(category.label)} ${normalizeTokenText(category.id)}`;
    return searchTokens.every((token) => searchable.includes(token));
  }).map((category) => category.id);
  const categoryExpression = categoryIds.map((id) => `"${id}"*`).join(' OR ');
  const ftsExpression = categoryExpression
    ? `(${tokenExpression}) OR (${categoryExpression})`
    : tokenExpression;
  if (Array.from(ftsExpression).length > 512) throw new DataBoundaryError();
  return { kinds, normalizedSearch, searchTokens, ftsExpression };
}

function mapRow(row: TransactionRow): Transaction {
  if (row.is_recurring !== 0 && row.is_recurring !== 1) throw new DataBoundaryError();
  try {
    return validateTransaction({
      id: row.id,
      kind: row.kind,
      amountMinor: row.amount_minor,
      categoryId: row.category_id,
      description: row.description,
      occurredOn: row.occurred_on,
      isRecurring: row.is_recurring === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof DataBoundaryError) throw error;
    throw new DataBoundaryError();
  }
}

function decodePayload(cursor: TransactionCursor): CursorPayload {
  let candidate: unknown;
  try {
    candidate = JSON.parse(utf8Decode(decodeBase64Url(cursor)));
  } catch {
    throw new InvalidCursorError();
  }
  if (!candidate || typeof candidate !== 'object' || !exactKeys(candidate, ['d', 'e', 'f', 'l', 'v'])) {
    throw new InvalidCursorError();
  }
  const record = candidate as Record<string, unknown>;
  const edge = record.e;
  if (record.v !== CURSOR_VERSION
    || (record.d !== 'older' && record.d !== 'newer')
    || typeof record.l !== 'string'
    || !isCanonicalUuid(record.l)
    || typeof record.f !== 'string'
    || !HEX_64.test(record.f)
    || !edge
    || typeof edge !== 'object'
    || !exactKeys(edge, ['c', 'i', 'o'])) {
    throw new InvalidCursorError();
  }
  const edgeRecord = edge as Record<string, unknown>;
  if (typeof edgeRecord.o !== 'string'
    || !isValidDateKey(edgeRecord.o)
    || typeof edgeRecord.c !== 'string'
    || !isValidIsoTimestamp(edgeRecord.c)
    || typeof edgeRecord.i !== 'string'
    || !isValidTransactionId(edgeRecord.i)) {
    throw new InvalidCursorError();
  }
  return candidate as CursorPayload;
}

export class TransactionQueryService {
  private readonly salt: string;
  private readonly digest: Digest;

  constructor(private readonly database: MigrationDatabase, options: QueryOptions = {}) {
    this.salt = options.salt ?? Crypto.randomUUID();
    this.digest = options.digest ?? (async (value) => Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value,
      { encoding: Crypto.CryptoEncoding.HEX },
    ));
  }

  async createCursor(
    query: TransactionQuery,
    direction: CursorDirection,
    edge: TransactionEdge,
  ): Promise<TransactionCursor> {
    const filters = normalizeTransactionFilters(query);
    if ((direction !== 'older' && direction !== 'newer')
      || !isValidDateKey(edge.occurredOn)
      || !isValidIsoTimestamp(edge.createdAt)
      || !isValidTransactionId(edge.id)) {
      throw new InvalidCursorError();
    }
    const fingerprint = await this.fingerprint(query.ledgerId, filters, direction, edge);
    const payload: CursorPayload = {
      v: 1,
      d: direction,
      l: query.ledgerId,
      f: fingerprint,
      e: { o: edge.occurredOn, c: edge.createdAt, i: edge.id },
    };
    const encoded = encodeBase64Url(utf8Encode(JSON.stringify(payload)));
    if (encoded.length > CURSOR_MAX_LENGTH) throw new InvalidCursorError();
    return encoded as TransactionCursor;
  }

  async listTransactionsPage(query: TransactionQuery): Promise<TransactionPage> {
    const filters = normalizeTransactionFilters(query);
    let payload: CursorPayload | null = null;
    if (query.cursor) {
      payload = decodePayload(query.cursor);
      const expected = await this.fingerprint(query.ledgerId, filters, payload.d, {
        occurredOn: payload.e.o,
        createdAt: payload.e.c,
        id: payload.e.i,
      });
      if (payload.l !== query.ledgerId || !constantEqual(payload.f, expected)) {
        throw new InvalidCursorError();
      }
    }

    const { sql, params } = this.buildSql(query, filters, payload, false);
    let rows: readonly TransactionRow[];
    try {
      rows = await this.database.all<TransactionRow>(sql, params);
    } catch {
      throw new DataBoundaryError();
    }
    const hasOverflow = rows.length > query.limit;
    const bounded = rows.slice(0, query.limit).map(mapRow);
    const items = payload?.d === 'newer' ? [...bounded].reverse() : bounded;
    if (items.length === 0) {
      return { items: [], olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false };
    }

    const hasOlder = payload === null ? hasOverflow : payload.d === 'older' ? hasOverflow : true;
    const hasNewer = payload === null ? false : payload.d === 'newer' ? hasOverflow : true;
    const olderCursor = hasOlder
      ? await this.createCursor(query, 'older', items[items.length - 1])
      : null;
    const newerCursor = hasNewer
      ? await this.createCursor(query, 'newer', items[0])
      : null;
    return { items, olderCursor, newerCursor, hasOlder, hasNewer };
  }

  async explain(query: TransactionQuery): Promise<readonly string[]> {
    const filters = normalizeTransactionFilters(query);
    const { sql, params } = this.buildSql(query, filters, null, true);
    const rows = await this.database.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params);
    return rows.map((row) => row.detail);
  }

  private async fingerprint(
    ledgerId: string,
    filters: NormalizedTransactionFilters,
    direction: CursorDirection,
    edge: TransactionEdge,
  ): Promise<string> {
    const value = await this.digest(JSON.stringify({
      salt: this.salt,
      ledgerId,
      kinds: filters.kinds,
      search: filters.normalizedSearch,
      direction,
      edge: {
        occurredOn: edge.occurredOn,
        createdAt: edge.createdAt,
        id: edge.id,
      },
    }));
    if (!HEX_64.test(value)) throw new InvalidCursorError();
    return value;
  }

  private buildSql(
    query: TransactionQuery,
    filters: NormalizedTransactionFilters,
    cursor: CursorPayload | null,
    _explain: boolean,
  ): { sql: string; params: readonly (string | number | null)[] } {
    const joins = filters.ftsExpression
      ? 'JOIN transaction_fts ON transaction_fts.rowid = transactions.rowid'
      : '';
    const clauses = ['transactions.ledger_id = ?'];
    const params: (string | number | null)[] = [query.ledgerId];
    if (filters.kinds.length > 0) {
      clauses.push(`transactions.kind IN (${filters.kinds.map(() => '?').join(', ')})`);
      params.push(...filters.kinds);
    }
    if (filters.ftsExpression) {
      clauses.push('transaction_fts MATCH ?');
      params.push(filters.ftsExpression);
    }
    if (cursor) {
      const comparator = cursor.d === 'older' ? '<' : '>';
      clauses.push(`(transactions.occurred_on, transactions.created_at, transactions.id) ${comparator} (?, ?, ?)`);
      params.push(cursor.e.o, cursor.e.c, cursor.e.i);
    }
    const order = cursor?.d === 'newer' ? 'ASC' : 'DESC';
    params.push(query.limit + 1);
    return {
      sql: `SELECT transactions.id, transactions.kind, transactions.amount_minor,
              transactions.category_id, transactions.description, transactions.occurred_on,
              transactions.legacy_recurring AS is_recurring, transactions.created_at,
              transactions.updated_at
            FROM transactions ${joins}
            WHERE ${clauses.join(' AND ')}
            ORDER BY transactions.occurred_on ${order}, transactions.created_at ${order},
              transactions.id ${order}
            LIMIT ?`,
      params,
    };
  }
}
