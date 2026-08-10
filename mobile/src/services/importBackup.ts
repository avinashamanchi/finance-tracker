import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { FinanceSnapshot } from '../domain/types';
import { MAX_BACKUP_BYTES, parseBackup } from './backup';
import { MAX_ENCRYPTED_BACKUP_BYTES } from './backupFormat';
import { openBinaryFile } from './artifacts';
import {
  importEncryptedBackup,
  inspectEncryptedBackup,
  type ImportableBackupRepository,
  type ImportReceipt,
} from './backupImporter';
import type { BackupManifest } from './backupRecords';

export async function pickFinovaBackup(): Promise<FinanceSnapshot | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const file = new File(result.assets[0].uri);
  try {
    if (!file.exists || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_BACKUP_BYTES) {
      throw new Error('The selected backup must be a Finova JSON file no larger than 1 MiB.');
    }
    return parseBackup(await file.text());
  } finally {
    if (file.exists) file.delete();
  }
}

export async function pickAndImportEncryptedBackup(
  repository: ImportableBackupRepository,
  password: string,
): Promise<ImportReceipt | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/octet-stream', 'application/x-finova-backup'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const file = new File(result.assets[0].uri);
  let binary: ReturnType<typeof openBinaryFile> | undefined;
  try {
    if (
      !file.exists
      || !Number.isSafeInteger(file.size)
      || file.size < 1
      || file.size > MAX_ENCRYPTED_BACKUP_BYTES
    ) throw new Error('The selected Finova backup must be no larger than 50 MiB.');
    binary = openBinaryFile(file.uri);
    return await importEncryptedBackup({ repository, file: binary, password });
  } finally {
    await binary?.close().catch(() => undefined);
    if (file.exists) file.delete();
  }
}

export type PendingEncryptedBackup = Readonly<{
  manifest: BackupManifest;
  importInto(repository: ImportableBackupRepository): Promise<ImportReceipt>;
  discard(): Promise<void>;
}>;

export async function pickEncryptedBackupForImport(
  password: string,
): Promise<PendingEncryptedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/octet-stream', 'application/x-finova-backup'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const file = new File(result.assets[0].uri);
  let binary: ReturnType<typeof openBinaryFile> | undefined;
  let settled = false;
  const dispose = async () => {
    if (settled) return;
    settled = true;
    await binary?.close().catch(() => undefined);
    if (file.exists) file.delete();
  };
  try {
    if (
      !file.exists
      || !Number.isSafeInteger(file.size)
      || file.size < 1
      || file.size > MAX_ENCRYPTED_BACKUP_BYTES
    ) throw new Error('The selected Finova backup must be no larger than 50 MiB.');
    binary = openBinaryFile(file.uri);
    const manifest = await inspectEncryptedBackup(binary, password);
    return {
      manifest,
      importInto: async (repository) => {
        if (settled || !binary) throw new Error('The selected Finova backup is no longer available.');
        try {
          return await importEncryptedBackup({ repository, file: binary, password });
        } finally {
          await dispose();
        }
      },
      discard: dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
