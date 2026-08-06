import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const SAFE_BASE = /^[a-z][a-z0-9-]{0,39}$/;
const SAFE_EXTENSION = /^(?:csv|json)$/;
const SAFE_FILENAME = /^[a-z][a-z0-9-]{0,39}-[0-9a-f-]{36}\.(?:csv|json)$/i;

export interface ArtifactFileSystem {
  readonly namespaceUri: string;
  createNamespace(): Promise<void>;
  writeText(name: string, contents: string): Promise<string>;
  deleteFile(uri: string): Promise<void>;
  deleteNamespace(): Promise<void>;
  owns(uri: string): boolean;
}

class ExpoArtifactFileSystem implements ArtifactFileSystem {
  readonly namespaceUri = new Directory(Paths.cache, 'finova-artifacts').uri.replace(/\/$/, '');

  async createNamespace(): Promise<void> {
    new Directory(this.namespaceUri).create({ idempotent: true, intermediates: true });
  }

  async writeText(name: string, contents: string): Promise<string> {
    if (!SAFE_FILENAME.test(name)) throw new Error('Invalid artifact filename.');
    const file = new File(`${this.namespaceUri}/${name}`);
    if (file.exists) file.delete();
    file.create({ intermediates: true, overwrite: false });
    file.write(contents);
    return file.uri;
  }

  async deleteFile(uri: string): Promise<void> {
    if (!this.owns(uri)) throw new Error('Artifact is outside the Finova cache.');
    const file = new File(uri);
    if (file.exists) file.delete();
  }

  async deleteNamespace(): Promise<void> {
    const directory = new Directory(this.namespaceUri);
    if (directory.exists) directory.delete();
  }

  owns(uri: string): boolean {
    if (!uri.startsWith(`${this.namespaceUri}/`)) return false;
    const name = uri.slice(this.namespaceUri.length + 1);
    return SAFE_FILENAME.test(name) && !name.includes('/');
  }
}

export class ArtifactStore {
  private readonly fileSystem: ArtifactFileSystem;
  private readonly createId: () => string;

  constructor(options: Readonly<{
    fileSystem?: ArtifactFileSystem;
    createId?: () => string;
  }> = {}) {
    this.fileSystem = options.fileSystem ?? new ExpoArtifactFileSystem();
    this.createId = options.createId ?? (() => Crypto.randomUUID());
  }

  async createText(base: string, extension: 'csv' | 'json', contents: string): Promise<string> {
    if (!SAFE_BASE.test(base) || !SAFE_EXTENSION.test(extension)) {
      throw new Error('Invalid artifact name.');
    }
    await this.fileSystem.createNamespace();
    return this.fileSystem.writeText(`${base}-${this.createId()}.${extension}`, contents);
  }

  async remove(uri: string): Promise<void> {
    if (!this.fileSystem.owns(uri)) throw new Error('Artifact is outside the Finova cache.');
    await this.fileSystem.deleteFile(uri);
  }

  async cleanupAll(): Promise<void> {
    await this.fileSystem.deleteNamespace();
  }
}

type SharingPort = Readonly<{
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options: Readonly<{ mimeType: string; UTI?: string }>): Promise<void>;
}>;

export type ShareReceipt = Readonly<{ sheetOpened: true; deliveryConfirmed: false }>;

const expoSharing: SharingPort = {
  isAvailableAsync: () => Sharing.isAvailableAsync(),
  shareAsync: (uri, options) => Sharing.shareAsync(uri, options),
};

export async function shareTextArtifact(
  store: ArtifactStore,
  sharing: SharingPort = expoSharing,
  base: string,
  extension: 'csv' | 'json',
  contents: string,
  mimeType: string,
): Promise<ShareReceipt> {
  const uri = await store.createText(base, extension, contents);
  try {
    if (!(await sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
    await sharing.shareAsync(uri, {
      mimeType,
      UTI: extension === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
    });
    return { sheetOpened: true, deliveryConfirmed: false };
  } catch {
    throw new Error('The share action was not completed.');
  } finally {
    await store.remove(uri);
  }
}
