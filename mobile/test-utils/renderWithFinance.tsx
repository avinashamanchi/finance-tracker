import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { FinanceProvider } from '../src/data/FinanceProvider';
import { InMemoryFinanceRepository } from '../src/data/inMemoryFinanceRepository';
import type { FinanceSnapshot } from '../src/domain/types';

export async function renderWithFinance(
  element: ReactElement,
  snapshot: FinanceSnapshot = { transactions: [], budgets: [] },
) {
  const repository = new InMemoryFinanceRepository({
    now: () => '2026-08-06T12:00:00.000Z',
    createId: () => '11111111-1111-4111-8111-111111111111',
  });
  await repository.replaceAll(snapshot);
  const view = await render(
    <FinanceProvider repository={repository}>{element}</FinanceProvider>,
  );
  return { ...view, repository };
}
