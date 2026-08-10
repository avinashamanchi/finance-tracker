import * as Crypto from 'expo-crypto';
import { Directory, File, Paths, type FileHandle } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { BackupByteSink, BackupByteSource } from './backupCrypto';

const SAFE_BASE = /^[a-z][a-z0-9-]{0,39}$/;
const SAFE_EXTENSION = /^(?:csv|finova|json)$/;
const SAFE_FILENAME = /^[a-z][a-z0-9-]{0,39}-[0-9a-f-]{36}\.(?:csv|finova|json)$/i;

export interface BinaryArtifact extends BackupByteSink, BackupByteSource {
  readonly uri: string;
  close(): Promise<void>;
}

export interface ArtifactFileSystem {
  readonly namespaceUri: string;
  createNamespace(): Promise<void>;
  writeText(name: string, contents: string): Promise<string>;
  createBinary(name: string): Promise<BinaryArtifact>;
  deleteFile(uri: string): Promise<void>;
  deleteNamespace(): Promise<void>;
  owns(uri: string): boolean;
}

class ExpoBinaryArtifact implements BinaryArtifact {
  private closed = false;

  constructor(
    readonly uri: string,
    private readonly handle: FileHandle,
  ) {}

  get size(): number {
    const size = this.handle.size;
    if (this.closed || !Number.isSafeInteger(size) || size === null || size < 0) {
      throw new Error('The Finova artifact is unavailable.');
    }
    return size;
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.requireOpen();
    this.handle.offset = this.size;
    this.handle.writeBytes(bytes);
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    this.requireOpen();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
      throw new Error('The Finova artifact read is invalid.');
    }
    this.handle.offset = offset;
    return this.handle.readBytes(length);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.handle.close();
    this.closed = true;
  }

  private requireOpen(): void {
    if (this.closed) throw new Error('The Finova artifact is closed.');
  }
}

class ExpoArtifactFileSystem implements ArtifactFileSystem {
  get namespaceUri(): string {
    return new Directory(Paths.cache, 'finova-artifacts').uri.replace(/\/$/, '');
  }

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

  async createBinary(name: string): Promise<BinaryArtifact> {
    if (!SAFE_FILENAME.test(name)) throw new Error('Invalid artifact filename.');
    const file = new File(`${this.namespaceUri}/${name}`);
    if (file.exists) file.delete();
    file.create({ intermediates: true, overwrite: false });
    return new ExpoBinaryArtifact(file.uri, file.open());
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

  async createBinary(base: string, extension: 'csv' | 'finova'): Promise<BinaryArtifact> {
    if (!SAFE_BASE.test(base) || !SAFE_EXTENSION.test(extension)) {
      throw new Error('Invalid artifact name.');
    }
    await this.fileSystem.createNamespace();
    return this.fileSystem.createBinary(`${base}-${this.createId()}.${extension}`);
  }

  async remove(uri: string): Promise<void> {
    if (!this.fileSystem.owns(uri)) throw new Error('Artifact is outside the Finova cache.');
    await this.fileSystem.deleteFile(uri);
  }

  async cleanupAll(): Promise<void> {
    await this.fileSystem.deleteNamespace();
  }
}

export function openBinaryFile(uri: string): BinaryArtifact {
  const file = new File(uri);
  if (!file.exists || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error('The selected file is unavailable.');
  }
  return new ExpoBinaryArtifact(file.uri, file.open());
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

export async function shareOwnedArtifact(
  store: Pick<ArtifactStore, 'remove'>,
  sharing: SharingPort = expoSharing,
  uri: string,
  options: Readonly<{ mimeType: string; UTI: string }>,
): Promise<ShareReceipt> {
  try {
    if (!(await sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
    await sharing.shareAsync(uri, options);
    return { sheetOpened: true, deliveryConfirmed: false };
  } catch {
    throw new Error('The share action was not completed.');
  } finally {
    await store.remove(uri);
  }
}
