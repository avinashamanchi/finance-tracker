import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { SettingsScreen, type SettingsOperations } from '../src/screens/SettingsScreen';
import { renderWithFinance } from '../test-utils/renderWithFinance';

const operations = (): SettingsOperations => ({
  exportBackup: jest.fn(async () => {}),
  exportCsv: jest.fn(async () => {}),
  pickBackup: jest.fn(async () => null),
  cleanupArtifacts: jest.fn(async () => {}),
});

describe('SettingsScreen', () => {
  it('exports only after an explicit user action and describes share limits', async () => {
    const ports = operations();
    const view = await renderWithFinance(<SettingsScreen onPrivacy={jest.fn()} onSupport={jest.fn()} operations={ports} />);
    await waitFor(() => expect(view.getByLabelText('Export Finova backup').props.accessibilityState)
      .toEqual({ disabled: false }));
    await fireEvent.press(view.getByLabelText('Export Finova backup'));
    await waitFor(() => expect(ports.exportBackup).toHaveBeenCalled());
    expect(view.getByText(/share sheet opening does not prove another app saved/i)).toBeTruthy();
  });

  it('requires the exact phrase DELETE before deleting local rows', async () => {
    const view = await renderWithFinance(<SettingsScreen onPrivacy={jest.fn()} onSupport={jest.fn()} operations={operations()} />, {
      transactions: [{
        id: 'one', kind: 'expense', amountMinor: 100, categoryId: 'dining', description: 'Coffee',
        occurredOn: '2026-08-06', isRecurring: false,
        createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z',
      }],
      budgets: [],
    });
    const button = view.getByLabelText('Delete all data');
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.changeText(view.getByLabelText('Delete confirmation'), 'delete');
    expect(view.getByLabelText('Delete all data').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.changeText(view.getByLabelText('Delete confirmation'), 'DELETE');
    await fireEvent.press(view.getByLabelText('Delete all data'));
    await waitFor(async () => expect(await view.repository.getTransactionById('one')).toBeNull());
    expect(view.getByText('All active Finova data was deleted from this installation.')).toBeTruthy();
  });

  it('requires confirmation before a validated backup replaces local data', async () => {
    const replacement = {
      transactions: [],
      budgets: [{ categoryId: 'groceries' as const, limitMinor: 12_300, updatedAt: '2026-08-06T00:00:00.000Z' }],
    };
    const ports = { ...operations(), pickBackup: jest.fn(async () => replacement) };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Replace')?.onPress?.();
    });
    const view = await renderWithFinance(<SettingsScreen onPrivacy={jest.fn()} onSupport={jest.fn()} operations={ports} />);
    await fireEvent.press(view.getByLabelText('Import Finova backup'));
    await waitFor(async () => expect(await view.repository.listBudgets()).toHaveLength(1));
    expect(alert).toHaveBeenCalledWith('Replace all Finova data?', expect.stringContaining('cannot be undone'), expect.any(Array));
    alert.mockRestore();
  });
});
