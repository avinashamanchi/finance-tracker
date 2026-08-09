import { MoneyRangeError } from './errors';
import type { CurrencyMinorUnit, Ledger } from './types';

export type MoneyParseResult =
  | Readonly<{ ok: true; minor: number }>
  | Readonly<{ ok: false; message: string }>;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function isMinorUnit(value: number): value is CurrencyMinorUnit {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function assertExactMinor(value: number): void {
  if (!Number.isSafeInteger(value)) throw new MoneyRangeError();
}

export function parseMinorAmount(raw: string, minorUnit: CurrencyMinorUnit): MoneyParseResult {
  if (!isMinorUnit(minorUnit)) return { ok: false, message: 'Enter a valid amount.' };
  const input = raw.trim();
  const fraction = minorUnit === 0 ? '' : `(?:\\.\\d{1,${minorUnit}})?`;
  const pattern = new RegExp(`^(?:\\d+|\\d{1,3}(?:,\\d{3})+)${fraction}$`);
  if (!pattern.test(input)) {
    return {
      ok: false,
      message: minorUnit === 0
        ? 'Enter a positive whole amount.'
        : `Enter a positive amount with up to ${minorUnit} decimal place${minorUnit === 1 ? '' : 's'}.`,
    };
  }

  const normalized = input.replaceAll(',', '');
  const [whole, rawFraction = ''] = normalized.split('.');
  try {
    const scale = 10n ** BigInt(minorUnit);
    const value = BigInt(whole) * scale
      + BigInt(rawFraction.padEnd(minorUnit, '0') || '0');
    if (value <= 0n || value > MAX_SAFE_BIGINT) {
      return { ok: false, message: 'Amount must be greater than zero and within the supported range.' };
    }
    return { ok: true, minor: Number(value) };
  } catch {
    return { ok: false, message: 'Enter a valid amount.' };
  }
}

function localizedDigits(locale: string): readonly string[] {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 });
  return Array.from({ length: 10 }, (_, digit) => formatter.format(digit));
}

function localizeAsciiDigits(value: string, locale: string): string {
  const digits = localizedDigits(locale);
  return Array.from(value, (character) => /\d/.test(character) ? digits[Number(character)] : character).join('');
}

export function formatMinor(value: number, ledger: Ledger, locale = 'en-US'): string {
  assertExactMinor(value);
  if (!/^[A-Z]{3}$/.test(ledger.currencyCode) || !isMinorUnit(ledger.currencyMinorUnit)) {
    throw new MoneyRangeError();
  }

  const minorUnit = ledger.currencyMinorUnit;
  const absolute = BigInt(value < 0 ? -value : value);
  const scale = 10n ** BigInt(minorUnit);
  const whole = absolute / scale;
  const fraction = minorUnit === 0
    ? ''
    : (absolute % scale).toString().padStart(minorUnit, '0');
  const templateValue: bigint | number = value < 0
    ? (whole === 0n ? -0 : -whole)
    : whole;
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ledger.currencyCode,
      minimumFractionDigits: minorUnit,
      maximumFractionDigits: minorUnit,
      useGrouping: true,
    });
  } catch {
    throw new MoneyRangeError();
  }
  const exactFraction = localizeAsciiDigits(fraction, locale);
  return formatter.formatToParts(templateValue).map((part) => (
    part.type === 'fraction' ? exactFraction : part.value
  )).join('');
}

export function minorToDecimal(value: number, minorUnit: CurrencyMinorUnit): string {
  assertExactMinor(value);
  if (!isMinorUnit(minorUnit)) throw new MoneyRangeError();
  const negative = value < 0;
  const absolute = BigInt(negative ? -value : value);
  const scale = 10n ** BigInt(minorUnit);
  const whole = absolute / scale;
  const fraction = minorUnit === 0 ? '' : `.${(absolute % scale).toString().padStart(minorUnit, '0')}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

export function addMinorExact(values: readonly number[]): number {
  let total = 0n;
  for (const value of values) {
    assertExactMinor(value);
    total += BigInt(value);
    if (total > MAX_SAFE_BIGINT || total < -MAX_SAFE_BIGINT) throw new MoneyRangeError();
  }
  return Number(total);
}

export function exactPercent(numerator: number, denominator: number): number {
  assertExactMinor(numerator);
  assertExactMinor(denominator);
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}
