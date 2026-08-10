import { z } from 'zod';

export const BACKUP_MAGIC = Uint8Array.from([0x46, 0x49, 0x4e, 0x4f, 0x56, 0x41, 0x32, 0x00]);
export const BACKUP_FORMAT_VERSION = 2;
export const FRAME_PLAINTEXT_BYTES = 65_536;
export const MAX_ENCRYPTED_BACKUP_BYTES = 52_428_800;
export const MAX_HEADER_BYTES = 4_096;
export const KDF_PARAMS = Object.freeze({
  N: 32_768,
  r: 8,
  p: 1,
  dkLen: 32,
  maxmem: 64 * 1024 * 1024,
  asyncTick: 4,
});

export const BACKUP_RECORD_KINDS = Object.freeze([
  'manifest',
  'ledger',
  'transaction',
  'budget_plan',
  'recurring_template',
  'expected_occurrence',
  'savings_goal',
  'goal_contribution',
] as const);

export type BackupRecordKind = (typeof BACKUP_RECORD_KINDS)[number];
export type BackupCounts = Readonly<Record<BackupRecordKind, number>>;

const CountSchema = z.number().int().min(0).max(1_000_000);
const CountsSchema = z.object(Object.fromEntries(
  BACKUP_RECORD_KINDS.map((kind) => [kind, CountSchema]),
) as Record<BackupRecordKind, typeof CountSchema>).strict();

const HeaderSchema = z.object({
  version: z.literal(BACKUP_FORMAT_VERSION),
  kdf: z.literal('scrypt'),
  cipher: z.literal('xchacha20-poly1305'),
  saltBase64: z.string().min(24).max(24),
  noncePrefixBase64: z.string().min(24).max(24),
  frameBytes: z.literal(FRAME_PLAINTEXT_BYTES),
  counts: CountsSchema,
}).strict();

export type BackupHeader = Readonly<z.infer<typeof HeaderSchema>>;

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => {
    const next = sum + part.length;
    if (!Number.isSafeInteger(next) || next > MAX_ENCRYPTED_BACKUP_BYTES) {
      throw new Error('Finova encrypted backup exceeds 50 MiB.');
    }
    return next;
  }, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function writeUint32(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('Backup integer is outside the supported range.');
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

export function readUint32(bytes: Uint8Array, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > bytes.length) {
    throw new Error('Backup frame is truncated.');
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

export function writeCounter(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Backup frame counter is invalid.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(counter), false);
  return bytes;
}

export function readCounter(bytes: Uint8Array, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 8 > bytes.length) {
    throw new Error('Backup frame is truncated.');
  }
  const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, false);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Backup frame counter is invalid.');
  return Number(value);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function base64ToBytes(value: string, length: number): Uint8Array {
  let binary: string;
  try {
    binary = globalThis.atob(value);
  } catch {
    throw new Error('Backup encoding is invalid.');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== length || bytesToBase64(bytes) !== value) {
    throw new Error('Backup encoding is invalid.');
  }
  return bytes;
}

export function createHeader(
  counts: BackupCounts,
  salt: Uint8Array,
  noncePrefix: Uint8Array,
): BackupHeader {
  const candidate = {
    version: BACKUP_FORMAT_VERSION,
    kdf: 'scrypt' as const,
    cipher: 'xchacha20-poly1305' as const,
    saltBase64: bytesToBase64(salt),
    noncePrefixBase64: bytesToBase64(noncePrefix),
    frameBytes: FRAME_PLAINTEXT_BYTES,
    counts: { ...counts },
  };
  const parsed = HeaderSchema.safeParse(candidate);
  if (!parsed.success) throw new Error('Backup header is invalid.');
  base64ToBytes(parsed.data.saltBase64, 16);
  base64ToBytes(parsed.data.noncePrefixBase64, 16);
  return parsed.data;
}

export function encodeHeader(header: BackupHeader): Uint8Array {
  const parsed = HeaderSchema.safeParse(header);
  if (!parsed.success) throw new Error('Backup header is invalid.');
  const bytes = new TextEncoder().encode(JSON.stringify(parsed.data));
  if (bytes.length < 1 || bytes.length > MAX_HEADER_BYTES) throw new Error('Backup header is invalid.');
  return bytes;
}

export function encodePrefix(header: BackupHeader): Readonly<{
  prefix: Uint8Array;
  headerBytes: Uint8Array;
}> {
  const headerBytes = encodeHeader(header);
  return {
    prefix: concatBytes([BACKUP_MAGIC, writeUint32(headerBytes.length), headerBytes]),
    headerBytes,
  };
}

export function decodePrefix(bytes: Uint8Array): Readonly<{
  header: BackupHeader;
  headerBytes: Uint8Array;
  nextOffset: number;
}> {
  if (bytes.length < BACKUP_MAGIC.length + 4) throw new Error('Backup header is truncated.');
  for (let index = 0; index < BACKUP_MAGIC.length; index += 1) {
    if (bytes[index] !== BACKUP_MAGIC[index]) throw new Error('Backup magic is invalid.');
  }
  const length = readUint32(bytes, BACKUP_MAGIC.length);
  if (length < 1 || length > MAX_HEADER_BYTES) throw new Error('Backup header is invalid.');
  const start = BACKUP_MAGIC.length + 4;
  const end = start + length;
  if (end > bytes.length) throw new Error('Backup header is truncated.');
  const headerBytes = bytes.slice(start, end);
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(headerBytes));
  } catch {
    throw new Error('Backup header is invalid.');
  }
  const parsed = HeaderSchema.safeParse(candidate);
  if (!parsed.success) throw new Error('Backup header is invalid.');
  base64ToBytes(parsed.data.saltBase64, 16);
  base64ToBytes(parsed.data.noncePrefixBase64, 16);
  return { header: parsed.data, headerBytes, nextOffset: end };
}
