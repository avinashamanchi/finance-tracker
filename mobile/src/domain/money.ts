export type MoneyParseResult =
  | Readonly<{ ok: true; cents: number }>
  | Readonly<{ ok: false; message: string }>;

const AMOUNT_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

export function parseAmountToCents(raw: string): MoneyParseResult {
  const input = raw.trim();
  if (!AMOUNT_PATTERN.test(input)) {
    return { ok: false, message: 'Enter a positive amount with up to two decimal places.' };
  }

  const normalized = input.replaceAll(',', '');
  const [whole, fraction = ''] = normalized.split('.');
  try {
    const centsBigInt = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (centsBigInt <= 0n || centsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { ok: false, message: 'Amount must be greater than zero and within the supported range.' };
    }
    return { ok: true, cents: Number(centsBigInt) };
  } catch {
    return { ok: false, message: 'Enter a valid amount.' };
  }
}

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Money must use safe integer cents.');
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
