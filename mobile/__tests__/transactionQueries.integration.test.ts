import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidCursorError } from '../src/domain/errors';
import { runMigrations } from '../src/data/migrations';
import type { MigrationContext } from '../src/data/migrations/types';
import { TransactionQueryService } from '../src/data/transactionQueries';
import type { TransactionQuery } from '../src/data/queryTypes';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

const context: MigrationContext = {
  legacyLedgerId: '10000000-0000-4000-8000-000000000001',
  currentMonth: '2026-08',
  nowIso: '2026-08-07T00:00:00.000Z',
};

const digest = async (value: string) => createHash('sha256').update(value).digest('hex');

function rewriteCursor(
  cursor: string,
  rewrite: (payload: Record<string, unknown>) => void,
): string {
  const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
  rewrite(payload);
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('bounded transaction queries', () => {
  let database: NodeMigrationAdapter;
  let service: TransactionQueryService;
  let directory: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'finova-transaction-query-'));
    database = new NodeMigrationAdapter(join(directory, 'finova.sqlite'));
    await runMigrations(database, context);
    service = new TransactionQueryService(database, { salt: 'fixed-session-salt', digest });
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  });

  async function insertRows(count: number, description = 'Shared description') {
    await database.exclusive(async (transaction) => {
      for (let index = 0; index < count; index += 1) {
        const id = index === 0 ? 'tránsäction-0000' : `tx-${String(index).padStart(4, '0')}`;
        await transaction.run(
          `INSERT INTO transactions(
             id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
             legacy_recurring, source_template_id, source_due_on, created_at, updated_at
           ) VALUES(?, ?, 'expense', 1, 'dining', ?, '2026-08-01', 0, NULL, NULL,
             '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
          [id, context.legacyLedgerId, description],
        );
      }
    });
  }

  const query = (overrides: Partial<TransactionQuery> = {}): TransactionQuery => ({
    ledgerId: context.legacyLedgerId,
    limit: 50,
    kinds: [],
    search: '',
    ...overrides,
  });

  it('traverses 500 equal-key-heavy rows first, older, then newer without gaps', async () => {
    await insertRows(550);
    const visited: string[] = [];
    let page = await service.listTransactionsPage(query());
    visited.push(...page.items.map((item) => item.id));
    while (page.hasOlder) {
      expect(page.olderCursor).not.toBeNull();
      page = await service.listTransactionsPage(query({ cursor: page.olderCursor! }));
      visited.push(...page.items.map((item) => item.id));
    }
    expect(visited).toHaveLength(550);
    expect(new Set(visited).size).toBe(550);

    const newestFromLast = await service.listTransactionsPage(query({ cursor: page.newerCursor! }));
    expect(newestFromLast.items).toHaveLength(50);
    expect(newestFromLast.items.at(-1)?.id).toBe('tx-0050');
  });

  it('uses UTF-8 base64url cursors for valid non-ASCII legacy IDs', async () => {
    await insertRows(2);
    const first = await service.listTransactionsPage(query({ limit: 1 }));
    const second = await service.listTransactionsPage(query({ limit: 1, cursor: first.olderCursor! }));
    expect(second.items[0].id).toBe('tránsäction-0000');
    expect(first.olderCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    'not-base64url',
    'e30',
    'a'.repeat(1025),
  ])('rejects malformed cursor %s before issuing SQL', async (cursor) => {
    const before = await database.first<{ count: number }>('SELECT COUNT(*) AS count FROM transactions');
    await expect(service.listTransactionsPage(query({ cursor: cursor as never })))
      .rejects.toBeInstanceOf(InvalidCursorError);
    expect(await database.first('SELECT COUNT(*) AS count FROM transactions')).toEqual(before);
  });

  it('binds cursors to direction, ledger, normalized filters, and session salt', async () => {
    await insertRows(3);
    const first = await service.listTransactionsPage(query({ limit: 1, kinds: ['expense'] }));
    await expect(service.listTransactionsPage(query({
      limit: 1,
      kinds: ['income'],
      cursor: first.olderCursor!,
    }))).rejects.toBeInstanceOf(InvalidCursorError);
    const other = new TransactionQueryService(database, { salt: 'different', digest });
    await expect(other.listTransactionsPage(query({ limit: 1, kinds: ['expense'], cursor: first.olderCursor! })))
      .rejects.toBeInstanceOf(InvalidCursorError);
  });

  it('authenticates direction and the complete edge tuple against cursor rewriting', async () => {
    await insertRows(3);
    const first = await service.listTransactionsPage(query({ limit: 1 }));
    const cursor = first.olderCursor!;
    const direction = rewriteCursor(cursor, (payload) => { payload.d = 'newer'; });
    const date = rewriteCursor(cursor, (payload) => {
      (payload.e as Record<string, unknown>).o = '2026-07-31';
    });
    const timestamp = rewriteCursor(cursor, (payload) => {
      (payload.e as Record<string, unknown>).c = '2026-07-31T00:00:00.000Z';
    });
    const identifier = rewriteCursor(cursor, (payload) => {
      (payload.e as Record<string, unknown>).i = 'rewritten-id';
    });
    for (const rewritten of [direction, date, timestamp, identifier]) {
      await expect(service.listTransactionsPage(query({ limit: 1, cursor: rewritten as never })))
        .rejects.toBeInstanceOf(InvalidCursorError);
    }
  });

  it.each([
    (payload: Record<string, unknown>) => { payload.v = 2; },
    (payload: Record<string, unknown>) => { payload.d = 'sideways'; },
    (payload: Record<string, unknown>) => { payload.extra = true; },
    (payload: Record<string, unknown>) => { (payload.e as Record<string, unknown>).o = '2026-02-30'; },
    (payload: Record<string, unknown>) => { (payload.e as Record<string, unknown>).c = 'not-a-time'; },
    (payload: Record<string, unknown>) => { (payload.e as Record<string, unknown>).i = 'bad/id'; },
  ])('rejects malformed exact cursor payloads before SQL', async (rewrite) => {
    await insertRows(2);
    const first = await service.listTransactionsPage(query({ limit: 1 }));
    const malformed = rewriteCursor(first.olderCursor!, rewrite);
    await expect(service.listTransactionsPage(query({ limit: 1, cursor: malformed as never })))
      .rejects.toBeInstanceOf(InvalidCursorError);
  });

  it('normalizes bounded Unicode FTS search and neutralizes operators', async () => {
    await insertRows(1, 'Café lunch OR rent');
    const cafe = await service.listTransactionsPage(query({ search: 'ＣＡＦÉ' }));
    expect(cafe.items).toHaveLength(1);
    const injected = await service.listTransactionsPage(query({ search: '" OR rent*' }));
    expect(injected.items).toHaveLength(1);
    await expect(service.listTransactionsPage(query({ search: 'one two three four five six seven eight nine' })))
      .rejects.toThrow();
    await expect(service.listTransactionsPage(query({ search: 'x'.repeat(81) }))).rejects.toThrow();
    expect((await service.listTransactionsPage(query({ search: '!!!' }))).items).toHaveLength(1);
    expect((await service.listTransactionsPage(query({ search: 'Dining' }))).items).toHaveLength(1);
  });

  it('rejects unpaired surrogates in search and cursor edge identifiers', async () => {
    await expect(service.listTransactionsPage(query({ search: '\ud800' }))).rejects.toThrow();
    await expect(service.createCursor(query(), 'older', {
      id: '\udc00', occurredOn: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z',
    })).rejects.toBeInstanceOf(InvalidCursorError);
  });

  it('uses the order index and FTS index in real SQLite plans', async () => {
    await insertRows(2);
    const plans = await service.explain(query({ search: 'shared' }));
    expect(plans.join(' ')).toMatch(/transactions_ledger_order|transaction_fts/i);
  });
});
