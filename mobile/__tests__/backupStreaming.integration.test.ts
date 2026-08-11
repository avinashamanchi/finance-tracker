import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteFinanceRepository } from '../src/data/financeRepository';
import type { MigrationContext } from '../src/data/migrations';
import type { BinaryArtifact } from '../src/services/artifacts';
import {
  exportEncryptedBackup,
  type BackupRecordSource,
  type StableBackupRepository,
} from '../src/services/backupExporter';
import {
  createEncryptedBackup,
} from '../src/services/backupCrypto';
import {
  importEncryptedBackup,
  inspectEncryptedBackup,
} from '../src/services/backupImporter';
import { createManifest, encodeBackupRecord } from '../src/services/backupRecords';
import type { BackupCounts } from '../src/services/backupFormat';
import { NodeMigrationAdapter } from './support/nodeMigrationAdapter';

class MemoryArtifact implements BinaryArtifact {
  private value = new Uint8Array();
  readonly uri = 'memory://finova-backup.finova';
  get size() { return this.value.length; }
  async write(bytes: Uint8Array) {
    const next = new Uint8Array(this.value.length + bytes.length);
    next.set(this.value);
    next.set(bytes, this.value.length);
    this.value = next;
  }
  async read(offset: number, length: number) { return this.value.slice(offset, offset + length); }
  async close() {}
  bytes() { return this.value.slice(); }
}

function memorySource(bytes: Uint8Array) {
  return {
    size: bytes.length,
    read: async (offset: number, length: number) => bytes.slice(offset, offset + length),
  };
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function expoDatabaseFrom(database: NodeMigrationAdapter): Record<string, unknown> {
  return {
    databasePath: database.filename,
    execAsync: (sql: string) => database.exec(sql),
    runAsync: (sql: string, params: readonly (string | number | null)[] = []) => database.run(sql, params),
    getFirstAsync: <T>(sql: string, params: readonly (string | number | null)[] = []) => database.first<T>(sql, params),
    getAllAsync: <T>(sql: string, params: readonly (string | number | null)[] = []) => database.all<T>(sql, params),
  };
}

const sourceContext: MigrationContext = {
  legacyLedgerId: '10000000-0000-4000-8000-000000000001',
  currentMonth: '2026-08',
  nowIso: '2026-08-10T00:00:00.000Z',
};

const targetContext: MigrationContext = {
  legacyLedgerId: '20000000-0000-4000-8000-000000000002',
  currentMonth: '2026-08',
  nowIso: '2026-08-10T00:00:00.000Z',
};

async function createRepository(database: NodeMigrationAdapter, context: MigrationContext) {
  const repository = new SQLiteFinanceRepository(expoDatabaseFrom(database) as never, context);
  await repository.initialize();
  return repository;
}

async function seedTransactions(database: NodeMigrationAdapter, ledgerId: string, count: number) {
  await database.exclusive(async (transaction) => {
    for (let index = 0; index < count; index += 1) {
      const id = `tx-${String(index).padStart(6, '0')}`;
      await transaction.run(
        `INSERT INTO transactions(
          id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
          legacy_recurring, source_template_id, source_due_on, created_at, updated_at
        ) VALUES(?, ?, 'expense', ?, 'groceries', ?, '2026-08-10', 0, NULL, NULL, ?, ?)`,
        [id, ledgerId, index + 1, `Expense ${index}`, sourceContext.nowIso, sourceContext.nowIso],
      );
    }
  });
}

describe('streamed SQLite encrypted backup and atomic import', () => {
  let directory: string;
  let sourceDatabase: NodeMigrationAdapter;
  let targetDatabase: NodeMigrationAdapter;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'finova-backup-'));
    sourceDatabase = new NodeMigrationAdapter(join(directory, 'source.db'));
    targetDatabase = new NodeMigrationAdapter(join(directory, 'target.db'));
  });

  afterEach(() => {
    sourceDatabase.close();
    targetDatabase.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads stable pages of at most 500 and atomically replaces a different local ledger', async () => {
    const source = await createRepository(sourceDatabase, sourceContext);
    await seedTransactions(sourceDatabase, sourceContext.legacyLedgerId, 1_201);
    await sourceDatabase.run(
      `INSERT INTO budget_plans VALUES(?, 'groceries', '2026-08', 50000, 'none', ?)`,
      [sourceContext.legacyLedgerId, sourceContext.nowIso],
    );
    const pageSizes: number[] = [];
    const trackedSource: StableBackupRepository = {
      withStableBackupSnapshot: <T>(work: (recordSource: BackupRecordSource) => Promise<T>) => (
        source.withStableBackupSnapshot((recordSource) => work({
          countRecords: () => recordSource.countRecords(),
          readRecordPage: async (kind, cursor, limit) => {
            pageSizes.push(limit);
            return recordSource.readRecordPage(kind, cursor, limit);
          },
        }))
      ),
    };
    const artifact = new MemoryArtifact();
    const receipt = await exportEncryptedBackup({
      repository: trackedSource,
      artifacts: {
        createBinary: async () => artifact,
        remove: async () => undefined,
      },
      password: 'correct horse battery staple',
      now: () => '2026-08-10T01:02:03.000Z',
      randomBytes: async (length) => Uint8Array.from({ length }, (_, index) => index + 1),
    });
    expect(receipt.recordCount).toBe(1_204);
    expect(Math.max(...pageSizes)).toBe(500);
    expect(pageSizes.length).toBeGreaterThan(7);

    const manifest = await inspectEncryptedBackup(artifact, 'correct horse battery staple');
    expect(manifest.counts.transaction).toBe(1_201);
    const target = await createRepository(targetDatabase, targetContext);
    await seedTransactions(targetDatabase, targetContext.legacyLedgerId, 1);
    await expect(importEncryptedBackup({
      repository: target,
      file: artifact,
      password: 'correct horse battery staple',
    })).resolves.toEqual({ replaced: true, recordCount: 1_204 });
    await expect(targetDatabase.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transactions WHERE ledger_id = ?',
      [targetContext.legacyLedgerId],
    )).resolves.toEqual({ count: 1_201 });
    await expect(targetDatabase.first(
      `SELECT id FROM transactions WHERE id = 'tx-000000'`,
    )).resolves.toEqual({ id: 'tx-000000' });
  });

  it('uses one failure message and retains live rows for wrong, tampered, and truncated files', async () => {
    const source = await createRepository(sourceDatabase, sourceContext);
    await seedTransactions(sourceDatabase, sourceContext.legacyLedgerId, 1);
    const artifact = new MemoryArtifact();
    await exportEncryptedBackup({
      repository: source,
      artifacts: { createBinary: async () => artifact, remove: async () => undefined },
      password: 'correct horse battery staple',
      randomBytes: async (length) => new Uint8Array(length).fill(7),
    });
    const target = await createRepository(targetDatabase, targetContext);
    await targetDatabase.run(
      `INSERT INTO transactions(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      ) VALUES('sentinel', ?, 'expense', 1, 'groceries', 'Sentinel', '2026-08-10',
        0, NULL, NULL, ?, ?)`,
      [targetContext.legacyLedgerId, targetContext.nowIso, targetContext.nowIso],
    );
    const original = artifact.bytes();
    const tampered = original.slice();
    tampered[tampered.length - 30] ^= 0x20;
    const attempts = [
      { bytes: original, password: 'wrong password value' },
      { bytes: tampered, password: 'correct horse battery staple' },
      { bytes: original.slice(0, -1), password: 'correct horse battery staple' },
    ];
    for (const attempt of attempts) {
      await expect(importEncryptedBackup({
        repository: target,
        file: memorySource(attempt.bytes),
        password: attempt.password,
      })).rejects.toThrow('password or file');
      await expect(targetDatabase.first(
        `SELECT id FROM transactions WHERE id = 'sentinel'`,
      )).resolves.toEqual({ id: 'sentinel' });
    }
  });

  it('rejects authenticated duplicate, unknown, and count-mismatched records before replacement', async () => {
    const target = await createRepository(targetDatabase, targetContext);
    await targetDatabase.run(
      `INSERT INTO transactions(
        id, ledger_id, kind, amount_minor, category_id, description, occurred_on,
        legacy_recurring, source_template_id, source_due_on, created_at, updated_at
      ) VALUES('sentinel', ?, 'expense', 1, 'groceries', 'Sentinel', '2026-08-10',
        0, NULL, NULL, ?, ?)`,
      [targetContext.legacyLedgerId, targetContext.nowIso, targetContext.nowIso],
    );
    const baseCounts = {
      manifest: 1, ledger: 1, transaction: 2, budget_plan: 0, recurring_template: 0,
      expected_occurrence: 0, savings_goal: 0, goal_contribution: 0,
    } as const;
    const ledger = {
      kind: 'ledger' as const,
      id: sourceContext.legacyLedgerId,
      name: 'Personal',
      currencyCode: 'USD',
      currencyMinorUnit: 2,
      createdAt: sourceContext.nowIso,
      updatedAt: sourceContext.nowIso,
    };
    const transaction = {
      kind: 'transaction' as const,
      id: 'duplicate-id',
      ledgerId: sourceContext.legacyLedgerId,
      transactionKind: 'expense' as const,
      amountMinor: 1,
      categoryId: 'groceries',
      description: 'Duplicate',
      occurredOn: '2026-08-10',
      isRecurring: false,
      sourceTemplateId: null,
      sourceDueOn: null,
      createdAt: sourceContext.nowIso,
      updatedAt: sourceContext.nowIso,
    };
    const encrypted = async (records: readonly Uint8Array[], counts: BackupCounts = baseCounts) => createEncryptedBackup({
      password: 'correct horse battery staple',
      counts,
      frames: [joinBytes(records)],
      randomBytes: async (length) => new Uint8Array(length).fill(9),
    });
    const duplicate = await encrypted([
      encodeBackupRecord(createManifest(baseCounts, sourceContext.nowIso)),
      encodeBackupRecord(ledger),
      encodeBackupRecord(transaction),
      encodeBackupRecord(transaction),
    ]);
    const countMismatch = await encrypted([
      encodeBackupRecord(createManifest(baseCounts, sourceContext.nowIso)),
      encodeBackupRecord(ledger),
      encodeBackupRecord(transaction),
    ]);
    const unknownCounts = { ...baseCounts, transaction: 0 };
    const unknown = await encrypted([
      encodeBackupRecord(createManifest(unknownCounts, sourceContext.nowIso)),
      encodeBackupRecord(ledger),
      new TextEncoder().encode('{"kind":"secret_future_record","value":"x"}\n'),
    ], unknownCounts);
    for (const bytes of [duplicate, countMismatch, unknown]) {
      await expect(importEncryptedBackup({
        repository: target,
        file: memorySource(bytes),
        password: 'correct horse battery staple',
      })).rejects.toThrow('password or file');
      await expect(targetDatabase.first(
        `SELECT id FROM transactions WHERE id = 'sentinel'`,
      )).resolves.toEqual({ id: 'sentinel' });
    }
  });
});
