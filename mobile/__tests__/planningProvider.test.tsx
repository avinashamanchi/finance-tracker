import { act, renderHook } from '@testing-library/react-native';

import { usePlanningController } from '../src/data/PlanningProvider';

const plan = {
  ledgerId: '11111111-1111-4111-8111-111111111111',
  categoryId: 'groceries' as const,
  month: '2026-08',
  limitMinor: 50_000,
  rolloverPolicy: 'none' as const,
};

it('blocks a fourth free budget for inactive and unknown entitlement without hiding existing plans', async () => {
  const repository = {
    setBudgetPlan: jest.fn(),
    listBudgetPlans: jest.fn().mockResolvedValue([
      { ...plan, categoryId: 'housing' },
      { ...plan, categoryId: 'utilities' },
      { ...plan, categoryId: 'groceries' },
      { ...plan, categoryId: 'dining' },
    ]),
    getBudgetUsage: jest.fn(),
    createGoal: jest.fn(),
    addGoalContribution: jest.fn(),
    archiveGoal: jest.fn(),
    listGoals: jest.fn(),
    getGoalProgress: jest.fn(),
  };
  const { result } = renderHook(() => usePlanningController(repository, 'unknown'));
  await act(async () => { await result.current.refresh('2026-08'); });
  expect(result.current.budgetPlans).toHaveLength(4);
  await expect(result.current.setBudgetPlan({ ...plan, categoryId: 'transport' }))
    .rejects.toThrow('Finova Plus');
  expect(repository.setBudgetPlan).not.toHaveBeenCalled();
});
