import { File, Paths } from 'expo-file-system';

export interface PreferenceStore {
  clear(): Promise<void>;
}

export class FinovaPreferenceStore implements PreferenceStore {
  async clear(): Promise<void> {
    const file = new File(Paths.document, 'finova-preferences.json');
    if (file.exists) file.delete();
  }
}
