import { fireEvent, waitFor } from '@testing-library/react-native';

import type { PlanningRepository } from '../src/data/planningRepository';
import type { SavingsGoal } from '../src/domain/planning';
import type { Ledger } from '../src/domain/types';
import { SavingsGoalDetailScreen } from '../src/screens/SavingsGoalDetailScreen';
import { SavingsGoalsScreen } from '../src/screens/SavingsGoalsScreen';
import { renderWithFinance } from '../test-utils/renderWithFinance';

const ledger: Ledger = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'My Finova ledger',
  currencyCode: 'USD',
  currencyMinorUnit: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const goal: SavingsGoal = {
  id: '40000000-0000-4000-8000-000000000001',
  ledgerId: ledger.id,
  name: 'Emergency fund',
  targetMinor: 100_000,
  targetOn: '2027-01-01',
  archivedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function repository(): jest.Mocked<PlanningRepository> {
  const result: PlanningRepository = {
    setBudgetPlan: jest.fn(),
    listBudgetPlans: jest.fn(async () => []),
    getBudgetUsage: jest.fn(),
    createGoal: jest.fn(),
    addGoalContribution: jest.fn(),
    archiveGoal: jest.fn(async () => {}),
    listGoals: jest.fn(async () => [goal]),
    getGoalProgress: jest.fn(async () => ({ recordedMinor: 25_000, remainingMinor: 75_000, percent: 25 })),
  };
  return result as jest.Mocked<PlanningRepository>;
}

describe('savings goal iOS flow', () => {
  it('shows existing planning data while verified Plus is unavailable', async () => {
    const planning = repository();
    const onOpen = jest.fn();
    const onUpgrade = jest.fn();
    const view = await renderWithFinance(
      <SavingsGoalsScreen
        entitlement="unknown"
        ledger={ledger}
        onNew={jest.fn()}
        onOpen={onOpen}
        onUpgrade={onUpgrade}
        repository={planning}
      />,
    );

    await waitFor(() => expect(view.getByText('Emergency fund')).toBeTruthy());
    expect(view.getByText(/never moves or reserves money/i)).toBeTruthy();
    fireEvent.press(view.getByLabelText('Unlock savings goals'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByLabelText('Open Emergency fund savings goal'));
    expect(onOpen).toHaveBeenCalledWith(goal);
  });

  it('does not record a contribution when entitlement verification is unavailable', async () => {
    const planning = repository();
    const onUpgrade = jest.fn();
    const view = await renderWithFinance(
      <SavingsGoalDetailScreen
        entitlement="inactive"
        goalId={goal.id}
        ledger={ledger}
        onDone={jest.fn()}
        onUpgrade={onUpgrade}
        repository={planning}
      />,
    );

    await waitFor(() => expect(view.getByText('NO MONEY IS MOVED')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Savings contribution amount'), '50');
    fireEvent.press(view.getByLabelText('Record savings contribution'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(planning.addGoalContribution).not.toHaveBeenCalled();
  });
});
