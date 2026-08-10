import { useCallback, useMemo, useRef, useState } from 'react';

import {
  PlusRequiredError,
  requireActivePlus,
  type EntitlementStatus,
} from '../access/entitlements';
import type {
  BudgetPlan,
  BudgetPlanDraft,
  GoalContributionDraft,
  SavingsGoal,
  SavingsGoalDraft,
} from '../domain/planning';
import type { PlanningRepository } from './planningRepository';

export type PlanningController = Readonly<{
  budgetPlans: readonly BudgetPlan[];
  goals: readonly SavingsGoal[];
  loading: boolean;
  error: string | null;
  refresh(month: string): Promise<void>;
  setBudgetPlan(draft: BudgetPlanDraft): Promise<void>;
  createGoal(draft: SavingsGoalDraft): Promise<void>;
  addGoalContribution(draft: GoalContributionDraft): Promise<void>;
  archiveGoal(goalId: string): Promise<void>;
}>;

export function usePlanningController(
  repository: PlanningRepository,
  entitlement: EntitlementStatus,
): PlanningController {
  const [budgetPlans, setBudgetPlans] = useState<readonly BudgetPlan[]>([]);
  const [goals, setGoals] = useState<readonly SavingsGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async (month: string) => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [nextPlans, nextGoals] = await Promise.all([
        repository.listBudgetPlans(month),
        repository.listGoals(false),
      ]);
      if (request !== generation.current) return;
      setBudgetPlans(nextPlans);
      setGoals(nextGoals);
    } catch {
      if (request === generation.current) setError('Finova planning data could not be loaded safely.');
      throw new Error('Finova planning data could not be loaded safely.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [repository]);

  const setPlan = useCallback(async (draft: BudgetPlanDraft) => {
    const existingPlans = await repository.listBudgetPlans(draft.month);
    const existing = existingPlans.find((plan) => plan.categoryId === draft.categoryId);
    if (entitlement !== 'active') {
      if (!existing && existingPlans.length >= 3) throw new PlusRequiredError();
      if (draft.rolloverPolicy !== 'none' && existing?.rolloverPolicy !== draft.rolloverPolicy) {
        throw new PlusRequiredError();
      }
    }
    await repository.setBudgetPlan(draft);
    await refresh(draft.month);
  }, [entitlement, refresh, repository]);

  const createGoal = useCallback(async (draft: SavingsGoalDraft) => {
    requireActivePlus(entitlement);
    await repository.createGoal(draft);
    setGoals(await repository.listGoals(false));
  }, [entitlement, repository]);

  const addGoalContribution = useCallback(async (draft: GoalContributionDraft) => {
    requireActivePlus(entitlement);
    await repository.addGoalContribution(draft);
    setGoals(await repository.listGoals(false));
  }, [entitlement, repository]);

  const archiveGoal = useCallback(async (goalId: string) => {
    await repository.archiveGoal(goalId);
    setGoals(await repository.listGoals(false));
  }, [repository]);

  return useMemo(() => ({
    budgetPlans,
    goals,
    loading,
    error,
    refresh,
    setBudgetPlan: setPlan,
    createGoal,
    addGoalContribution,
    archiveGoal,
  }), [
    addGoalContribution,
    archiveGoal,
    budgetPlans,
    createGoal,
    error,
    goals,
    loading,
    refresh,
    setPlan,
  ]);
}
