import type { ImportStagingSession } from '../data/importStagingRepository';
import {
  BACKUP_RECORD_KINDS,
  FRAME_PLAINTEXT_BYTES,
  type BackupCounts,
  type BackupRecordKind,
} from './backupFormat';
import {
  EncryptedBackupReader,
  type BackupByteSource,
} from './backupCrypto';
import {
  parseBackupRecord,
  type BackupManifest,
  type DataBackupRecord,
} from './backupRecords';

const GENERIC_IMPORT_ERROR = 'The backup password or file is invalid.';

export interface ImportableBackupRepository {
  beginBackupImport(): Promise<ImportStagingSession>;
}

export type ImportReceipt = Readonly<{
  replaced: true;
  recordCount: number;
}>;

function countsMatch(left: BackupCounts, right: BackupCounts): boolean {
  return BACKUP_RECORD_KINDS.every((kind) => left[kind] === right[kind]);
}

function totalRecords(counts: BackupCounts): number {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total < 2 || total > 1_000_000) {
    throw new Error(GENERIC_IMPORT_ERROR);
  }
  return total;
}

async function readAndValidate(
  source: BackupByteSource,
  password: string,
  onDataBatch?: (records: readonly DataBackupRecord[]) => Promise<void>,
): Promise<BackupManifest> {
  const reader = await EncryptedBackupReader.open(source, password);
  const observed = Object.fromEntries(
    BACKUP_RECORD_KINDS.map((kind) => [kind, 0]),
  ) as Record<BackupRecordKind, number>;
  let manifest: BackupManifest | undefined;
  let previousKind = -1;
  let pending = new Uint8Array();
  let batch: DataBackupRecord[] = [];

  const flush = async () => {
    if (batch.length === 0 || !onDataBatch) return;
    const supplied = batch;
    batch = [];
    await onDataBatch(supplied);
  };

  const accept = async (line: Uint8Array) => {
    const record = parseBackupRecord(line);
    const kindIndex = BACKUP_RECORD_KINDS.indexOf(record.kind);
    if (kindIndex < previousKind) throw new Error(GENERIC_IMPORT_ERROR);
    previousKind = kindIndex;
    observed[record.kind] += 1;
    if (record.kind === 'manifest') {
      if (manifest || observed.manifest !== 1 || kindIndex !== 0) {
        throw new Error(GENERIC_IMPORT_ERROR);
      }
      manifest = record;
      if (!countsMatch(record.counts, reader.header.counts)) {
        throw new Error(GENERIC_IMPORT_ERROR);
      }
      return;
    }
    if (!manifest) throw new Error(GENERIC_IMPORT_ERROR);
    if (onDataBatch) {
      batch.push(record);
      if (batch.length === 500) await flush();
    }
  };

  try {
    while (true) {
      const frame = await reader.nextFrame();
      if (frame === null) break;
      const combined = new Uint8Array(pending.length + frame.length);
      combined.set(pending);
      combined.set(frame, pending.length);
      pending.fill(0);
      frame.fill(0);
      let start = 0;
      for (let index = 0; index < combined.length; index += 1) {
        if (combined[index] !== 0x0a) continue;
        const length = index + 1 - start;
        if (length > FRAME_PLAINTEXT_BYTES) throw new Error(GENERIC_IMPORT_ERROR);
        const line = combined.slice(start, index + 1);
        try {
          await accept(line);
        } finally {
          line.fill(0);
        }
        start = index + 1;
      }
      pending = combined.slice(start);
      combined.fill(0);
      if (pending.length >= FRAME_PLAINTEXT_BYTES) throw new Error(GENERIC_IMPORT_ERROR);
    }
    if (pending.length !== 0 || !manifest) throw new Error(GENERIC_IMPORT_ERROR);
    await flush();
    if (!countsMatch(observed, manifest.counts)) throw new Error(GENERIC_IMPORT_ERROR);
    totalRecords(manifest.counts);
    return manifest;
  } catch (error) {
    if (error instanceof Error && /12 to 128|unsupported characters/.test(error.message)) throw error;
    throw new Error(GENERIC_IMPORT_ERROR);
  } finally {
    pending.fill(0);
    batch = [];
    reader.abort();
  }
}

export function inspectEncryptedBackup(
  source: BackupByteSource,
  password: string,
): Promise<BackupManifest> {
  return readAndValidate(source, password);
}

export async function importEncryptedBackup(options: Readonly<{
  repository: ImportableBackupRepository;
  file: BackupByteSource;
  password: string;
}>): Promise<ImportReceipt> {
  const staging = await options.repository.beginBackupImport();
  try {
    const manifest = await readAndValidate(
      options.file,
      options.password,
      (records) => staging.appendRecords(records),
    );
    await staging.replaceFromStaging(manifest.counts);
    return {
      replaced: true,
      recordCount: totalRecords(manifest.counts),
    };
  } catch (error) {
    await staging.dropStaging().catch(() => undefined);
    if (error instanceof Error && /12 to 128|unsupported characters/.test(error.message)) throw error;
    throw new Error(GENERIC_IMPORT_ERROR);
  }
}
