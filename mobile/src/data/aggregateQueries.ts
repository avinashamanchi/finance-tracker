import { DataBoundaryError, LedgerCapacityError, MoneyRangeError } from '../domain/errors';
import { isCategoryForKind } from '../domain/categories';
import { addMinorExact, exactPercent } from '../domain/money';
import { assertMonth, shiftMonth } from '../domain/summaries';
import type { MonthSummary, MonthlyPoint, TransactionKind } from '../domain/types';
import type { MigrationDatabase } from './migrations/types';
import { MAX_LEDGER_TRANSACTIONS, isCanonicalUuid } from './validation';

const LIMB_BASE = 1_000_000n;

type CapacityRow = Readonly<{ count: number }>;
type AggregateRow = Readonly<{
  month_key?: string;
  kind: TransactionKind;
  category_id?: string;
  quotient_sum: number;
  remainder_sum: number;
  row_count: number;
}>;

function requireSafeNonNegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new DataBoundaryError();
  return value;
}

function reconstruct(row: AggregateRow): number {
  const quotient = requireSafeNonNegativeInteger(row.quotient_sum);
  const remainder = requireSafeNonNegativeInteger(row.remainder_sum);
  const exact = BigInt(quotient) * LIMB_BASE + BigInt(remainder);
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyRangeError();
  return Number(exact);
}

async function requireGlobalCapacity(
  database: MigrationDatabase,
  ledgerId: string,
): Promise<void> {
  const row = await database.first<CapacityRow>(
    `SELECT COUNT(*) AS count
     FROM (
       SELECT 1 FROM transactions WHERE ledger_id = ? LIMIT ?
     ) AS bounded_ledger`,
    [ledgerId, MAX_LEDGER_TRANSACTIONS + 1],
  );
  if (!row) throw new DataBoundaryError();
  const count = requireSafeNonNegativeInteger(row.count);
  if (count > MAX_LEDGER_TRANSACTIONS) throw new LedgerCapacityError();
}

function monthBounds(month: string): readonly [string, string] {
  try {
    assertMonth(month);
    return [`${month}-01`, `${shiftMonth(month, 1)}-01`];
  } catch {
    throw new DataBoundaryError();
  }
}

function asBoundaryError(error: unknown): never {
  if (
    error instanceof MoneyRangeError ||
    error instanceof LedgerCapacityError ||
    error instanceof DataBoundaryError
  ) {
    throw error;
  }
  throw new DataBoundaryError();
}

export async function getMonthSummary(
  database: MigrationDatabase,
  ledgerId: string,
  month: string,
): Promise<MonthSummary> {
  if (!isCanonicalUuid(ledgerId)) throw new DataBoundaryError();
  const [start, end] = monthBounds(month);
  try {
    return await database.exclusive(async (snapshot) => {
      await requireGlobalCapacity(snapshot, ledgerId);
      const rows = await snapshot.all<AggregateRow>(
        `SELECT kind, category_id,
                SUM(CAST(amount_minor / 1000000 AS INTEGER)) AS quotient_sum,
                SUM(amount_minor % 1000000) AS remainder_sum,
                COUNT(*) AS row_count
         FROM (
           SELECT kind, category_id, amount_minor
           FROM transactions
           WHERE ledger_id = ? AND occurred_on >= ? AND occurred_on < ?
           LIMIT ?
         ) AS bounded_month
         GROUP BY kind, category_id`,
        [ledgerId, start, end, MAX_LEDGER_TRANSACTIONS + 1],
      );
      const incomeValues: number[] = [];
      const expenseValues: number[] = [];
      const expenseByCategory: Record<string, number> = {};
      let transactionCount = 0;
      for (const row of rows) {
        if (typeof row.category_id !== 'string' || !isCategoryForKind(row.category_id, row.kind)) {
          throw new DataBoundaryError();
        }
        const value = reconstruct(row);
        transactionCount += requireSafeNonNegativeInteger(row.row_count);
        if (!Number.isSafeInteger(transactionCount)) throw new DataBoundaryError();
        if (row.kind === 'income') {
          incomeValues.push(value);
        } else if (row.kind === 'expense') {
          expenseValues.push(value);
          expenseByCategory[row.category_id] = value;
        } else {
          throw new DataBoundaryError();
        }
      }
      const incomeMinor = addMinorExact(incomeValues);
      const expenseMinor = addMinorExact(expenseValues);
      const balanceMinor = addMinorExact([incomeMinor, -expenseMinor]);
      return {
        month,
        incomeMinor,
        expenseMinor,
        balanceMinor,
        savingsRatePercent: exactPercent(balanceMinor, incomeMinor),
        transactionCount,
        expenseByCategory,
      };
    });
  } catch (error) {
    return asBoundaryError(error);
  }
}

export async function getSixMonthTrend(
  database: MigrationDatabase,
  ledgerId: string,
  anchorMonth: string,
): Promise<MonthlyPoint[]> {
  if (!isCanonicalUuid(ledgerId)) throw new DataBoundaryError();
  const months: string[] = [];
  try {
    assertMonth(anchorMonth);
    for (let offset = -5; offset <= 0; offset += 1) months.push(shiftMonth(anchorMonth, offset));
  } catch {
    throw new DataBoundaryError();
  }
  const start = `${months[0]}-01`;
  const end = `${shiftMonth(anchorMonth, 1)}-01`;
  try {
    return await database.exclusive(async (snapshot) => {
      await requireGlobalCapacity(snapshot, ledgerId);
      const rows = await snapshot.all<AggregateRow>(
        `SELECT substr(occurred_on, 1, 7) AS month_key, kind, category_id,
                SUM(CAST(amount_minor / 1000000 AS INTEGER)) AS quotient_sum,
                SUM(amount_minor % 1000000) AS remainder_sum,
                COUNT(*) AS row_count
         FROM (
           SELECT occurred_on, kind, category_id, amount_minor
           FROM transactions
           WHERE ledger_id = ? AND occurred_on >= ? AND occurred_on < ?
           LIMIT ?
         ) AS bounded_trend
         GROUP BY month_key, kind, category_id`,
        [ledgerId, start, end, MAX_LEDGER_TRANSACTIONS + 1],
      );
      const values = new Map<string, { income: number[]; expense: number[] }>();
      for (const month of months) values.set(month, { income: [], expense: [] });
      for (const row of rows) {
        if (typeof row.month_key !== 'string' || !values.has(row.month_key)) {
          throw new DataBoundaryError();
        }
        if (typeof row.category_id !== 'string' || !isCategoryForKind(row.category_id, row.kind)) {
          throw new DataBoundaryError();
        }
        const bucket = values.get(row.month_key)!;
        if (row.kind === 'income') bucket.income.push(reconstruct(row));
        else if (row.kind === 'expense') bucket.expense.push(reconstruct(row));
        else throw new DataBoundaryError();
      }
      return months.map((month) => {
        const bucket = values.get(month)!;
        const incomeMinor = addMinorExact(bucket.income);
        const expenseMinor = addMinorExact(bucket.expense);
        return {
          month,
          incomeMinor,
          expenseMinor,
          balanceMinor: addMinorExact([incomeMinor, -expenseMinor]),
        };
      });
    });
  } catch (error) {
    return asBoundaryError(error);
  }
}
