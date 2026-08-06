import { StyleSheet } from 'react-native';
import { EmptyState } from '../src/components/EmptyState';
import { MetricCard } from '../src/components/MetricCard';
import { render } from '@testing-library/react-native';

describe('accessibility foundation', () => {
  it('gives primary empty-state controls a 44-point target and button role', async () => {
    const view = await render(
      <EmptyState title="Empty" detail="Add data" actionLabel="Add transaction" onAction={jest.fn()} />,
    );
    const action = view.getByLabelText('Add transaction');
    expect(action.props.accessibilityRole).toBe('button');
    const style = StyleSheet.flatten(action.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('exposes metric meaning as text rather than color alone', async () => {
    const view = await render(<MetricCard label="Balance" value="$12.00" detail="Positive this month" tone="positive" />);
    expect(view.getByText('Balance')).toBeTruthy();
    expect(view.getByText('Positive this month')).toBeTruthy();
  });
});
