import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { FinanceSnapshot } from '../domain/types';
import { MAX_BACKUP_BYTES, parseBackup } from './backup';

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
