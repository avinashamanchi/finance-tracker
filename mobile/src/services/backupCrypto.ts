import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import * as Crypto from 'expo-crypto';

import { hasUnpairedSurrogate } from '../data/validation';
import {
  FRAME_PLAINTEXT_BYTES,
  KDF_PARAMS,
  MAX_ENCRYPTED_BACKUP_BYTES,
  base64ToBytes,
  concatBytes,
  createHeader,
  decodePrefix,
  encodePrefix,
  readCounter,
  readUint32,
  writeCounter,
  writeUint32,
  type BackupCounts,
  type BackupHeader,
} from './backupFormat';

const TAG_BYTES = 16;
const FRAME_OVERHEAD = 12;
const GENERIC_OPEN_ERROR = 'The backup password or file is invalid.';

type RandomBytes = (length: number) => Promise<Uint8Array>;

export interface BackupByteSink {
  write(bytes: Uint8Array): Promise<void>;
}

export interface BackupByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

function validatePassword(password: string): Uint8Array {
  const length = Array.from(password).length;
  if (length < 12 || length > 128) throw new Error('Backup password must contain 12 to 128 characters.');
  if (password.includes('\u0000') || hasUnpairedSurrogate(password)) {
    throw new Error('Backup password contains unsupported characters.');
  }
  const bytes = new TextEncoder().encode(password);
  if (bytes.length > 512) throw new Error('Backup password must contain 12 to 128 characters.');
  return bytes;
}

function nonceFor(prefix: Uint8Array, counter: number): Uint8Array {
  if (prefix.length !== 16) throw new Error('Backup nonce prefix is invalid.');
  return concatBytes([prefix, writeCounter(counter)]);
}

function aadFor(headerBytes: Uint8Array, counter: number): Uint8Array {
  return concatBytes([headerBytes, writeCounter(counter)]);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBytes = validatePassword(password);
  try {
    return await scryptAsync(passwordBytes, salt, KDF_PARAMS);
  } finally {
    passwordBytes.fill(0);
  }
}

async function readExact(
  source: BackupByteSource,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > source.size
  ) throw new Error(GENERIC_OPEN_ERROR);
  const bytes = await source.read(offset, length);
  if (bytes.length !== length) throw new Error(GENERIC_OPEN_ERROR);
  return bytes;
}

export class EncryptedBackupWriter {
  private counter = 0;
  private byteCount = 0;
  private closed = false;

  private constructor(
    private readonly sink: BackupByteSink,
    private readonly key: Uint8Array,
    private readonly salt: Uint8Array,
    private readonly noncePrefix: Uint8Array,
    private readonly headerBytes: Uint8Array,
  ) {}

  static async create(options: Readonly<{
    sink: BackupByteSink;
    password: string;
    counts: BackupCounts;
    randomBytes?: RandomBytes;
  }>): Promise<EncryptedBackupWriter> {
    const randomBytes = options.randomBytes ?? ((length) => Crypto.getRandomBytesAsync(length));
    const salt = await randomBytes(16);
    const noncePrefix = await randomBytes(16);
    if (salt.length !== 16 || noncePrefix.length !== 16) {
      salt.fill(0);
      noncePrefix.fill(0);
      throw new Error('Secure backup randomness is unavailable.');
    }
    let key: Uint8Array | undefined;
    let transferred = false;
    try {
      const header = createHeader(options.counts, salt, noncePrefix);
      const { prefix, headerBytes } = encodePrefix(header);
      key = await deriveKey(options.password, salt);
      await options.sink.write(prefix);
      const writer = new EncryptedBackupWriter(
        options.sink,
        key,
        salt,
        noncePrefix,
        headerBytes,
      );
      writer.byteCount = prefix.length;
      key = undefined;
      transferred = true;
      return writer;
    } finally {
      key?.fill(0);
      if (!transferred) {
        salt.fill(0);
        noncePrefix.fill(0);
      }
    }
  }

  get bytesWritten(): number {
    return this.byteCount;
  }

  async writeFrame(supplied: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Encrypted backup writer is closed.');
    if (supplied.length < 1 || supplied.length > FRAME_PLAINTEXT_BYTES) {
      throw new Error('Backup data frame must contain 1 to 65536 bytes.');
    }
    const plaintext = supplied.slice();
    try {
      await this.writeEncrypted(plaintext);
    } finally {
      plaintext.fill(0);
    }
  }

  async close(): Promise<number> {
    if (this.closed) throw new Error('Encrypted backup writer is closed.');
    try {
      await this.writeEncrypted(new Uint8Array());
      return this.byteCount;
    } finally {
      this.destroy();
    }
  }

  abort(): void {
    this.destroy();
  }

  private async writeEncrypted(plaintext: Uint8Array): Promise<void> {
    const encoded = await encryptBackupFrame(
      this.key,
      this.noncePrefix,
      this.headerBytes,
      this.counter,
      plaintext,
    );
    const nextSize = this.byteCount + encoded.length;
    if (!Number.isSafeInteger(nextSize) || nextSize > MAX_ENCRYPTED_BACKUP_BYTES) {
      throw new Error('Finova encrypted backup exceeds 50 MiB.');
    }
    await this.sink.write(encoded);
    this.byteCount = nextSize;
    this.counter += 1;
  }

  private destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.key.fill(0);
    this.salt.fill(0);
    this.noncePrefix.fill(0);
  }
}

export class EncryptedBackupReader {
  readonly header: BackupHeader;
  private offset: number;
  private counter = 0;
  private terminalSeen = false;
  private closed = false;

  private constructor(
    private readonly source: BackupByteSource,
    header: BackupHeader,
    private readonly headerBytes: Uint8Array,
    private readonly key: Uint8Array,
    private readonly salt: Uint8Array,
    private readonly noncePrefix: Uint8Array,
    nextOffset: number,
  ) {
    this.header = header;
    this.offset = nextOffset;
  }

  static async open(source: BackupByteSource, password: string): Promise<EncryptedBackupReader> {
    if (!Number.isSafeInteger(source.size) || source.size < 1 || source.size > MAX_ENCRYPTED_BACKUP_BYTES) {
      throw new Error(GENERIC_OPEN_ERROR);
    }
    let key: Uint8Array | undefined;
    let salt: Uint8Array | undefined;
    let noncePrefix: Uint8Array | undefined;
    try {
      const fixed = await readExact(source, 0, 12);
      const headerLength = readUint32(fixed, 8);
      if (headerLength < 1 || headerLength > 4_096) throw new Error(GENERIC_OPEN_ERROR);
      const prefix = concatBytes([fixed, await readExact(source, 12, headerLength)]);
      const decoded = decodePrefix(prefix);
      salt = base64ToBytes(decoded.header.saltBase64, 16);
      noncePrefix = base64ToBytes(decoded.header.noncePrefixBase64, 16);
      key = await deriveKey(password, salt);
      const reader = new EncryptedBackupReader(
        source,
        decoded.header,
        decoded.headerBytes,
        key,
        salt,
        noncePrefix,
        decoded.nextOffset,
      );
      key = undefined;
      salt = undefined;
      noncePrefix = undefined;
      return reader;
    } catch (error) {
      key?.fill(0);
      salt?.fill(0);
      noncePrefix?.fill(0);
      if (error instanceof Error && /12 to 128|unsupported characters/.test(error.message)) throw error;
      throw new Error(GENERIC_OPEN_ERROR);
    }
  }

  async nextFrame(): Promise<Uint8Array | null> {
    if (this.closed || this.terminalSeen) throw new Error(GENERIC_OPEN_ERROR);
    try {
      const frameHeader = await readExact(this.source, this.offset, FRAME_OVERHEAD);
      const counter = readCounter(frameHeader, 0);
      const length = readUint32(frameHeader, 8);
      if (
        counter !== this.counter
        || length < TAG_BYTES
        || length > FRAME_PLAINTEXT_BYTES + TAG_BYTES
      ) throw new Error(GENERIC_OPEN_ERROR);
      const ciphertext = await readExact(
        this.source,
        this.offset + FRAME_OVERHEAD,
        length,
      );
      const plaintext = await decryptBackupFrame(
        this.key,
        this.noncePrefix,
        this.headerBytes,
        counter,
        ciphertext,
      );
      this.offset += FRAME_OVERHEAD + length;
      this.counter += 1;
      if (plaintext.length === 0) {
        this.terminalSeen = true;
        if (this.offset !== this.source.size) throw new Error(GENERIC_OPEN_ERROR);
        this.destroy();
        return null;
      }
      return plaintext;
    } catch {
      this.destroy();
      throw new Error(GENERIC_OPEN_ERROR);
    }
  }

  abort(): void {
    this.destroy();
  }

  private destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.key.fill(0);
    this.salt.fill(0);
    this.noncePrefix.fill(0);
  }
}

export async function encryptBackupFrame(
  key: Uint8Array,
  noncePrefix: Uint8Array,
  headerBytes: Uint8Array,
  counter: number,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  if (plaintext.length > FRAME_PLAINTEXT_BYTES) throw new Error('Backup frame exceeds 64 KiB.');
  const ciphertext = xchacha20poly1305(
    key,
    nonceFor(noncePrefix, counter),
    aadFor(headerBytes, counter),
  ).encrypt(plaintext);
  return concatBytes([writeCounter(counter), writeUint32(ciphertext.length), ciphertext]);
}

export async function decryptBackupFrame(
  key: Uint8Array,
  noncePrefix: Uint8Array,
  headerBytes: Uint8Array,
  counter: number,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  if (ciphertext.length < TAG_BYTES || ciphertext.length > FRAME_PLAINTEXT_BYTES + TAG_BYTES) {
    throw new Error(GENERIC_OPEN_ERROR);
  }
  return xchacha20poly1305(
    key,
    nonceFor(noncePrefix, counter),
    aadFor(headerBytes, counter),
  ).decrypt(ciphertext);
}

export async function createEncryptedBackup(options: Readonly<{
  password: string;
  counts: BackupCounts;
  frames: readonly Uint8Array[];
  randomBytes?: RandomBytes;
}>): Promise<Uint8Array> {
  const randomBytes = options.randomBytes ?? ((length) => Crypto.getRandomBytesAsync(length));
  const salt = await randomBytes(16);
  const noncePrefix = await randomBytes(16);
  if (salt.length !== 16 || noncePrefix.length !== 16) throw new Error('Secure backup randomness is unavailable.');
  let key: Uint8Array | undefined;
  try {
    const header = createHeader(options.counts, salt, noncePrefix);
    const { prefix, headerBytes } = encodePrefix(header);
    key = await deriveKey(options.password, salt);
    const output: Uint8Array[] = [prefix];
    let counter = 0;
    for (const supplied of options.frames) {
      if (supplied.length < 1 || supplied.length > FRAME_PLAINTEXT_BYTES) {
        throw new Error('Backup data frame must contain 1 to 65536 bytes.');
      }
      const plaintext = supplied.slice();
      try {
        output.push(await encryptBackupFrame(key, noncePrefix, headerBytes, counter, plaintext));
      } finally {
        plaintext.fill(0);
      }
      counter += 1;
    }
    output.push(await encryptBackupFrame(key, noncePrefix, headerBytes, counter, new Uint8Array()));
    const result = concatBytes(output);
    if (result.length > MAX_ENCRYPTED_BACKUP_BYTES) throw new Error('Finova encrypted backup exceeds 50 MiB.');
    return result;
  } finally {
    key?.fill(0);
    salt.fill(0);
    noncePrefix.fill(0);
  }
}

export async function openEncryptedBackup(
  bytes: Uint8Array,
  password: string,
): Promise<Readonly<{ header: BackupHeader; frames: readonly Uint8Array[] }>> {
  if (bytes.length < 1 || bytes.length > MAX_ENCRYPTED_BACKUP_BYTES) throw new Error(GENERIC_OPEN_ERROR);
  let key: Uint8Array | undefined;
  let salt: Uint8Array | undefined;
  let noncePrefix: Uint8Array | undefined;
  try {
    const { header, headerBytes, nextOffset } = decodePrefix(bytes);
    salt = base64ToBytes(header.saltBase64, 16);
    noncePrefix = base64ToBytes(header.noncePrefixBase64, 16);
    key = await deriveKey(password, salt);
    const frames: Uint8Array[] = [];
    let offset = nextOffset;
    let expectedCounter = 0;
    let terminalSeen = false;
    while (offset < bytes.length) {
      if (offset + FRAME_OVERHEAD > bytes.length) throw new Error(GENERIC_OPEN_ERROR);
      const counter = readCounter(bytes, offset);
      const length = readUint32(bytes, offset + 8);
      offset += FRAME_OVERHEAD;
      if (counter !== expectedCounter || length < TAG_BYTES || length > FRAME_PLAINTEXT_BYTES + TAG_BYTES) {
        throw new Error(GENERIC_OPEN_ERROR);
      }
      if (offset + length > bytes.length) throw new Error(GENERIC_OPEN_ERROR);
      const ciphertext = bytes.slice(offset, offset + length);
      offset += length;
      const plaintext = await decryptBackupFrame(
        key,
        noncePrefix,
        headerBytes,
        counter,
        ciphertext,
      );
      expectedCounter += 1;
      if (plaintext.length === 0) {
        terminalSeen = true;
        if (offset !== bytes.length) throw new Error(GENERIC_OPEN_ERROR);
        break;
      }
      frames.push(plaintext);
    }
    if (!terminalSeen) throw new Error(GENERIC_OPEN_ERROR);
    return { header, frames };
  } catch (error) {
    if (error instanceof Error && /12 to 128|unsupported characters/.test(error.message)) throw error;
    throw new Error(GENERIC_OPEN_ERROR);
  } finally {
    key?.fill(0);
    salt?.fill(0);
    noncePrefix?.fill(0);
  }
}
