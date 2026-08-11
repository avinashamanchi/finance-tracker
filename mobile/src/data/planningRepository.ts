import { DataBoundaryError, MoneyRangeError } from '../domain/errors';
import { addMinorExact, exactPercent } from '../domain/money';
import {
  type BudgetPlan,
  type BudgetPlanDraft,
  type GoalContribution,
  type GoalContributionDraft,
  type GoalProgress,
  type PlanningBudgetUsage,
  type SavingsGoal,
  type SavingsGoalDraft,
  validateBudgetPlanDraft,
  validateGoalContributionDraft,
  validateSavingsGoalDraft,
} from '../domain/planning';
import { shiftCanonicalMonth } from '../domain/recurrence';
import { serializeDatabaseAccess } from './configureConnection';
import type { MigrationDatabase } from './migrations';
import { isCanonicalUuid, isValidIsoTimestamp } from './validation';

type Options = Readonly<{ now?: () => Date; createId?: () => string }>;

type BudgetPlanRow = Readonly<{
  ledger_id: string;
  category_id: BudgetPlan['categoryId'];
  month: string;
  limit_minor: number;
  rollover_policy: BudgetPlan['rolloverPolicy'];
  updated_at: string;
}>;

type GoalRow = Readonly<{
  id: string;
  ledger_id: string;
  name: string;
  target_minor: number;
  target_on: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}>;

type ContributionRow = Readonly<{
  id: string;
  goal_id: string;
  amount_minor: number;
  occurred_on: string;
  note: string;
  created_at: string;
}>;

type SumRow = Readonly<{ high: number | null; low: number | null; count: number }>;

function readClock(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new DataBoundaryError();
  return new Date(value.getTime());
}

function mapBudgetPlan(row: BudgetPlanRow): BudgetPlan {
  if (!isValidIsoTimestamp(row.updated_at)) throw new DataBoundaryError();
  try {
    return {
      ...validateBudgetPlanDraft({
        ledgerId: row.ledger_id,
        categoryId: row.category_id,
        month: row.month,
        limitMinor: row.limit_minor,
        rolloverPolicy: row.rollover_policy,
      }),
      updatedAt: row.updated_at,
    };
  } catch {
    throw new DataBoundaryError();
  }
}

function mapGoal(row: GoalRow): SavingsGoal {
  if (
    !isValidIsoTimestamp(row.created_at)
    || !isValidIsoTimestamp(row.updated_at)
    || (row.archived_at !== null && !isValidIsoTimestamp(row.archived_at))
  ) throw new DataBoundaryError();
  try {
    return {
      ...validateSavingsGoalDraft({
        id: row.id,
        ledgerId: row.ledger_id,
        name: row.name,
        targetMinor: row.target_minor,
        targetOn: row.target_on,
      }),
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    throw new DataBoundaryError();
  }
}

function mapContribution(row: ContributionRow): GoalContribution {
  if (!isValidIsoTimestamp(row.created_at)) throw new DataBoundaryError();
  try {
    return {
      ...validateGoalContributionDraft({
        id: row.id,
        goalId: row.goal_id,
        amountMinor: row.amount_minor,
        occurredOn: row.occurred_on,
        note: row.note,
      }),
      createdAt: row.created_at,
    };
  } catch {
    throw new DataBoundaryError();
  }
}

function exactSqlSum(row: SumRow | null): number {
  if (
    !row
    || !Number.isSafeInteger(row.count)
    || row.count < 0
    || (row.high !== null && !Number.isSafeInteger(row.high))
    || (row.low !== null && !Number.isSafeInteger(row.low))
  ) throw new DataBoundaryError();
  const total = BigInt(row.high ?? 0) * 1_000_000n + BigInt(row.low ?? 0);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < 0n) throw new MoneyRangeError();
  return Number(total);
}

export interface PlanningRepository {
  setBudgetPlan(draft: BudgetPlanDraft): Promise<BudgetPlan>;
  listBudgetPlans(month: string): Promise<readonly BudgetPlan[]>;
  getBudgetUsage(ledgerId: string, categoryId: BudgetPlan['categoryId'], month: string): Promise<PlanningBudgetUsage>;
  createGoal(draft: SavingsGoalDraft): Promise<SavingsGoal>;
  addGoalContribution(draft: GoalContributionDraft): Promise<GoalContribution>;
  archiveGoal(goalId: string): Promise<void>;
  listGoals(includeArchived?: boolean): Promise<readonly SavingsGoal[]>;
  getGoalProgress(goalId: string): Promise<GoalProgress>;
}

export class SQLitePlanningRepository implements PlanningRepository {
  private readonly clock: () => Date;

  constructor(
    private readonly database: MigrationDatabase,
    private readonly ledgerId: string,
    options: Options = {},
  ) {
    if (!isCanonicalUuid(ledgerId)) throw new DataBoundaryError();
    this.clock = options.now ?? (() => new Date());
    void options.createId;
  }

  async setBudgetPlan(draft: BudgetPlanDraft): Promise<BudgetPlan> {
    const valid = validateBudgetPlanDraft(draft);
    if (valid.ledgerId !== this.ledgerId) throw new DataBoundaryError();
    const updatedAt = readClock(this.clock).toISOString();
    return this.serialized(() => this.database.exclusive(async (database) => {
      await database.run(
        `INSERT INTO budget_plans(
          ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ledger_id, category_id, month) DO UPDATE SET
          limit_minor = excluded.limit_minor,
          rollover_policy = excluded.rollover_policy,
          updated_at = excluded.updated_at`,
        [
          valid.ledgerId,
          valid.categoryId,
          valid.month,
          valid.limitMinor,
          valid.rolloverPolicy,
          updatedAt,
        ],
      );
      return { ...valid, updatedAt };
    }));
  }

  async listBudgetPlans(month: string): Promise<readonly BudgetPlan[]> {
    const validMonth = validateBudgetPlanDraft({
      ledgerId: this.ledgerId,
      categoryId: 'housing',
      month,
      limitMinor: 1,
      rolloverPolicy: 'none',
    }).month;
    return this.serialized(async () => {
      const rows = await this.database.all<BudgetPlanRow>(
        `SELECT ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
         FROM budget_plans WHERE ledger_id = ? AND month = ? ORDER BY category_id LIMIT 101`,
        [this.ledgerId, validMonth],
      );
      if (rows.length > 100) throw new DataBoundaryError();
      return rows.map(mapBudgetPlan);
    });
  }

  async getBudgetUsage(
    ledgerId: string,
    categoryId: BudgetPlan['categoryId'],
    month: string,
  ): Promise<PlanningBudgetUsage> {
    const key = validateBudgetPlanDraft({
      ledgerId,
      categoryId,
      month,
      limitMinor: 1,
      rolloverPolicy: 'none',
    });
    if (key.ledgerId !== this.ledgerId) throw new DataBoundaryError();
    return this.serialized(async () => {
      const current = await this.database.first<BudgetPlanRow>(
        `SELECT ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
         FROM budget_plans WHERE ledger_id = ? AND category_id = ? AND month = ?`,
        [this.ledgerId, categoryId, month],
      );
      if (!current) throw new Error('Budget plan not found.');
      const currentPlan = mapBudgetPlan(current);
      const previousMonth = shiftCanonicalMonth(month, -1);
      const previous = await this.database.first<BudgetPlanRow>(
        `SELECT ledger_id, category_id, month, limit_minor, rollover_policy, updated_at
         FROM budget_plans WHERE ledger_id = ? AND category_id = ? AND month = ?`,
        [this.ledgerId, categoryId, previousMonth],
      );
      const [spentMinor, previousSpentMinor] = await Promise.all([
        this.readExpenseSum(this.database, categoryId, month),
        this.readExpenseSum(this.database, categoryId, previousMonth),
      ]);
      let carryMinor = 0;
      if (previous && currentPlan.rolloverPolicy === 'carry_unused') {
        const previousPlan = mapBudgetPlan(previous);
        if (previousPlan.rolloverPolicy === 'carry_unused') {
          carryMinor = Math.max(0, addMinorExact([previousPlan.limitMinor, -previousSpentMinor]));
        }
      }
      const availableMinor = addMinorExact([currentPlan.limitMinor, carryMinor]);
      const remainingMinor = addMinorExact([availableMinor, -spentMinor]);
      return {
        baseMinor: currentPlan.limitMinor,
        carryMinor,
        spentMinor,
        availableMinor,
        remainingMinor,
      };
    });
  }

  async createGoal(draft: SavingsGoalDraft): Promise<SavingsGoal> {
    const valid = validateSavingsGoalDraft(draft);
    if (valid.ledgerId !== this.ledgerId) throw new DataBoundaryError();
    const now = readClock(this.clock).toISOString();
    return this.serialized(() => this.database.exclusive(async (database) => {
      const existing = await database.first<GoalRow>('SELECT * FROM savings_goals WHERE id = ?', [valid.id]);
      if (existing) {
        const mapped = mapGoal(existing);
        if (
          mapped.ledgerId === valid.ledgerId
          && mapped.name === valid.name
          && mapped.targetMinor === valid.targetMinor
          && mapped.targetOn === valid.targetOn
          && mapped.archivedAt === null
        ) return mapped;
        throw new Error('Savings goal identifier is already in use.');
      }
      try {
        await database.run(
          `INSERT INTO savings_goals(
            id, ledger_id, name, target_minor, target_on, archived_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
          [valid.id, valid.ledgerId, valid.name, valid.targetMinor, valid.targetOn, now, now],
        );
      } catch {
        throw new Error('An active savings goal already uses that name.');
      }
      return { ...valid, archivedAt: null, createdAt: now, updatedAt: now };
    }));
  }

  async addGoalContribution(draft: GoalContributionDraft): Promise<GoalContribution> {
    const valid = validateGoalContributionDraft(draft);
    return this.serialized(() => this.database.exclusive(async (database) => {
      const existing = await database.first<ContributionRow>(
        'SELECT * FROM goal_contributions WHERE id = ?',
        [valid.id],
      );
      if (existing) {
        const mapped = mapContribution(existing);
        if (
          mapped.goalId === valid.goalId
          && mapped.amountMinor === valid.amountMinor
          && mapped.occurredOn === valid.occurredOn
          && mapped.note === valid.note
        ) return mapped;
        throw new Error('Goal contribution identifier is already in use.');
      }
      const goal = await database.first<GoalRow>(
        'SELECT * FROM savings_goals WHERE id = ? AND ledger_id = ?',
        [valid.goalId, this.ledgerId],
      );
      if (!goal) throw new Error('Savings goal not found.');
      if (goal.archived_at !== null) throw new Error('Archived savings goals cannot receive contributions.');
      const createdAt = readClock(this.clock).toISOString();
      await database.run(
        `INSERT INTO goal_contributions(
          id, goal_id, amount_minor, occurred_on, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [valid.id, valid.goalId, valid.amountMinor, valid.occurredOn, valid.note, createdAt],
      );
      return { ...valid, createdAt };
    }));
  }

  async archiveGoal(goalId: string): Promise<void> {
    if (!isCanonicalUuid(goalId)) throw new DataBoundaryError();
    await this.serialized(() => this.database.exclusive(async (database) => {
      const goal = await database.first<{ id: string }>(
        'SELECT id FROM savings_goals WHERE id = ? AND ledger_id = ?',
        [goalId, this.ledgerId],
      );
      if (!goal) throw new Error('Savings goal not found.');
      const now = readClock(this.clock).toISOString();
      await database.run(
        'UPDATE savings_goals SET archived_at = ?, updated_at = ? WHERE id = ? AND ledger_id = ?',
        [now, now, goalId, this.ledgerId],
      );
    }));
  }

  async listGoals(includeArchived = false): Promise<readonly SavingsGoal[]> {
    return this.serialized(async () => {
      const rows = await this.database.all<GoalRow>(
        `SELECT * FROM savings_goals
         WHERE ledger_id = ? AND (? = 1 OR archived_at IS NULL)
         ORDER BY lower(name), id LIMIT 1001`,
        [this.ledgerId, includeArchived ? 1 : 0],
      );
      if (rows.length > 1000) throw new DataBoundaryError();
      return rows.map(mapGoal);
    });
  }

  async getGoalProgress(goalId: string): Promise<GoalProgress> {
    if (!isCanonicalUuid(goalId)) throw new DataBoundaryError();
    return this.serialized(async () => {
      const goalRow = await this.database.first<GoalRow>(
        'SELECT * FROM savings_goals WHERE id = ? AND ledger_id = ?',
        [goalId, this.ledgerId],
      );
      if (!goalRow) throw new Error('Savings goal not found.');
      const goal = mapGoal(goalRow);
      const recordedMinor = exactSqlSum(await this.database.first<SumRow>(
        `SELECT
          sum(CAST(amount_minor / 1000000 AS INTEGER)) AS high,
          sum(amount_minor % 1000000) AS low,
          count(*) AS count
         FROM goal_contributions WHERE goal_id = ?`,
        [goalId],
      ));
      return {
        recordedMinor,
        remainingMinor: Math.max(0, addMinorExact([goal.targetMinor, -recordedMinor])),
        percent: Math.min(100, exactPercent(recordedMinor, goal.targetMinor)),
      };
    });
  }

  private async readExpenseSum(
    database: MigrationDatabase,
    categoryId: BudgetPlan['categoryId'],
    month: string,
  ): Promise<number> {
    return exactSqlSum(await database.first<SumRow>(
      `SELECT
        sum(CAST(amount_minor / 1000000 AS INTEGER)) AS high,
        sum(amount_minor % 1000000) AS low,
        count(*) AS count
       FROM transactions
       WHERE ledger_id = ? AND kind = 'expense' AND category_id = ?
         AND occurred_on >= ? AND occurred_on < ?`,
      [this.ledgerId, categoryId, `${month}-01`, `${shiftCanonicalMonth(month, 1)}-01`],
    ));
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    return serializeDatabaseAccess(this.database.identity, work);
  }
}
