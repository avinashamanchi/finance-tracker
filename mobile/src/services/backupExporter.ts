import { FRAME_PLAINTEXT_BYTES, type BackupCounts } from './backupFormat';
import { EncryptedBackupWriter } from './backupCrypto';
import type { ArtifactStore } from './artifacts';
import {
  createManifest,
  encodeBackupRecord,
  type DataBackupRecord,
  type DataBackupRecordKind,
} from './backupRecords';

export const BACKUP_PAGE_SIZE = 500;
export const DATA_BACKUP_RECORD_KINDS = Object.freeze([
  'ledger',
  'transaction',
  'budget_plan',
  'recurring_template',
  'expected_occurrence',
  'savings_goal',
  'goal_contribution',
] as const satisfies readonly DataBackupRecordKind[]);

export type BackupRecordPage = Readonly<{
  records: readonly DataBackupRecord[];
  nextCursor: number | null;
}>;

export interface BackupRecordSource {
  countRecords(): Promise<BackupCounts>;
  readRecordPage(
    kind: DataBackupRecordKind,
    afterRowId: number | null,
    limit: number,
  ): Promise<BackupRecordPage>;
}

export interface StableBackupRepository {
  withStableBackupSnapshot<T>(work: (source: BackupRecordSource) => Promise<T>): Promise<T>;
}

export type ArtifactReceipt = Readonly<{
  uri: string;
  byteCount: number;
  recordCount: number;
}>;

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

export async function exportEncryptedBackup(options: Readonly<{
  repository: StableBackupRepository;
  artifacts: Pick<ArtifactStore, 'createBinary' | 'remove'>;
  password: string;
  now?: () => string;
  randomBytes?: (length: number) => Promise<Uint8Array>;
}>): Promise<ArtifactReceipt> {
  const artifact = await options.artifacts.createBinary('finova-backup', 'finova');
  let writer: EncryptedBackupWriter | undefined;
  try {
    const receipt = await options.repository.withStableBackupSnapshot(async (source) => {
      const counts = await source.countRecords();
      if (counts.manifest !== 1 || counts.ledger !== 1) {
        throw new Error('Finova backup record counts are invalid.');
      }
      const now = options.now?.() ?? new Date().toISOString();
      const manifest = createManifest(counts, now);
      writer = await EncryptedBackupWriter.create({
        sink: artifact,
        password: options.password,
        counts,
        randomBytes: options.randomBytes,
      });

      let frame: Uint8Array<ArrayBufferLike> = new Uint8Array();
      let recordCount = 0;
      const writeRecord = async (record: Parameters<typeof encodeBackupRecord>[0]) => {
        const encoded = encodeBackupRecord(record);
        if (frame.length > 0 && frame.length + encoded.length > FRAME_PLAINTEXT_BYTES) {
          await writer!.writeFrame(frame);
          frame.fill(0);
          frame = new Uint8Array();
        }
        frame = appendBytes(frame, encoded);
        encoded.fill(0);
        recordCount += 1;
      };

      await writeRecord(manifest);
      for (const kind of DATA_BACKUP_RECORD_KINDS) {
        let cursor: number | null = null;
        let seen = 0;
        do {
          const page = await source.readRecordPage(kind, cursor, BACKUP_PAGE_SIZE);
          if (page.records.length > BACKUP_PAGE_SIZE) {
            throw new Error('Finova backup source exceeded its page bound.');
          }
          for (const record of page.records) {
            if (record.kind !== kind) throw new Error('Finova backup record order is invalid.');
            await writeRecord(record);
            seen += 1;
          }
          if (
            page.nextCursor !== null
            && (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < 1 || page.nextCursor === cursor)
          ) throw new Error('Finova backup cursor is invalid.');
          cursor = page.nextCursor;
        } while (cursor !== null);
        if (seen !== counts[kind]) throw new Error('Finova backup record count changed during export.');
      }
      if (frame.length > 0) {
        await writer.writeFrame(frame);
        frame.fill(0);
      }
      const byteCount = await writer.close();
      writer = undefined;
      const declared = Object.values(counts).reduce((sum, count) => sum + count, 0);
      if (recordCount !== declared) throw new Error('Finova backup record count is invalid.');
      return { uri: artifact.uri, byteCount, recordCount };
    });
    await artifact.close();
    return receipt;
  } catch (error) {
    writer?.abort();
    await artifact.close().catch(() => undefined);
    await options.artifacts.remove(artifact.uri).catch(() => undefined);
    throw error;
  }
}
