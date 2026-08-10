import type { BinaryArtifact } from '../src/services/artifacts';
import type {
  BackupRecordPage,
  BackupRecordSource,
  StableBackupRepository,
} from '../src/services/backupExporter';
import type { DataBackupRecordKind } from '../src/services/backupRecords';
import { exportCsv } from '../src/services/csvExporter';

class MemoryArtifact implements BinaryArtifact {
  private value = new Uint8Array();
  readonly uri = 'memory://finova-transactions.csv';
  get size() { return this.value.length; }
  async write(bytes: Uint8Array) {
    const next = new Uint8Array(this.value.length + bytes.length);
    next.set(this.value);
    next.set(bytes, this.value.length);
    this.value = next;
  }
  async read(offset: number, length: number) { return this.value.slice(offset, offset + length); }
  async close() {}
  text() { return new TextDecoder().decode(this.value); }
}

describe('streaming CSV export', () => {
  it('reads at most 500 records, writes incrementally, and emits every exact row once', async () => {
    const ledgerId = '10000000-0000-4000-8000-000000000001';
    const timestamp = '2026-08-10T00:00:00.000Z';
    const transactions = Array.from({ length: 1_001 }, (_, index) => ({
      kind: 'transaction' as const,
      id: `tx-${String(index).padStart(6, '0')}`,
      ledgerId,
      transactionKind: 'expense' as const,
      amountMinor: index === 1_000 ? Number.MAX_SAFE_INTEGER : index + 1,
      categoryId: 'groceries',
      description: index === 0 ? '=SUM(A1:A2)' : `Row ${index}`,
      occurredOn: '2026-08-10',
      isRecurring: false,
      sourceTemplateId: null,
      sourceDueOn: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const limits: number[] = [];
    const source: BackupRecordSource = {
      countRecords: async () => ({
        manifest: 1,
        ledger: 1,
        transaction: transactions.length,
        budget_plan: 0,
        recurring_template: 0,
        expected_occurrence: 0,
        savings_goal: 0,
        goal_contribution: 0,
      }),
      readRecordPage: async (
        kind: DataBackupRecordKind,
        cursor: number | null,
        limit: number,
      ): Promise<BackupRecordPage> => {
        limits.push(limit);
        if (kind === 'ledger') {
          return {
            records: [{
              kind: 'ledger',
              id: ledgerId,
              name: 'Personal',
              currencyCode: 'USD',
              currencyMinorUnit: 2,
              createdAt: timestamp,
              updatedAt: timestamp,
            }],
            nextCursor: null,
          };
        }
        if (kind !== 'transaction') return { records: [], nextCursor: null };
        const start = cursor ?? 0;
        const records = transactions.slice(start, start + limit);
        return {
          records,
          nextCursor: start + records.length < transactions.length ? start + records.length : null,
        };
      },
    };
    const repository: StableBackupRepository = {
      withStableBackupSnapshot: (work) => work(source),
    };
    const artifact = new MemoryArtifact();
    const receipt = await exportCsv({
      repository,
      artifacts: { createBinary: async () => artifact, remove: async () => undefined },
    });
    expect(receipt.recordCount).toBe(1_001);
    expect(Math.max(...limits)).toBe(500);
    const lines = artifact.text().split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1_002);
    expect(lines[0]).toBe('Date,Type,Category,Description,Amount USD,Recurring');
    expect(lines[1]).toContain("'=SUM(A1:A2)");
    expect(lines.at(-1)).toContain('90071992547409.91');
    for (let index = 1; index < 1_000; index += 1) {
      expect(lines.filter((line) => line.includes(`Row ${index},`))).toHaveLength(1);
    }
  });
});
