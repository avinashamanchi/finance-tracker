import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
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

  it('keeps CSV export behind Plus while backup portability remains free', async () => {
    const ports = operations();
    const onUpgrade = jest.fn();
    const view = await renderWithFinance(
      <SettingsScreen
        onPlans={onUpgrade}
        onPrivacy={jest.fn()}
        onSupport={jest.fn()}
        onTerms={jest.fn()}
        operations={ports}
      />,
      { transactions: [{
        id: 'one', kind: 'expense', amountMinor: 100, categoryId: 'dining', description: 'Coffee',
        occurredOn: '2026-08-06', isRecurring: false,
        createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z',
      }], budgets: [] },
    );

    await waitFor(() => expect(view.getByLabelText('Export transaction CSV').props.accessibilityState).toEqual({ disabled: false }));
    await act(async () => { fireEvent.press(view.getByLabelText('Export transaction CSV')); });
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(ports.exportCsv).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(view.getByLabelText('Export Finova backup')); });
    await waitFor(() => expect(ports.exportBackup).toHaveBeenCalledTimes(1));
  });

  it('requires a matching confirmation before encrypted backup export', async () => {
    const ports: SettingsOperations = {
      ...operations(),
      exportEncryptedBackup: jest.fn(async () => {}),
      pickEncryptedBackup: jest.fn(async () => null),
    };
    const view = await renderWithFinance(
      <SettingsScreen onPrivacy={jest.fn()} onSupport={jest.fn()} operations={ports} />,
      { transactions: [], budgets: [] },
      (repository) => Object.assign(repository, {
        withStableBackupSnapshot: jest.fn(),
        beginBackupImport: jest.fn(),
      }),
    );
    await waitFor(() => expect(view.getByLabelText('Backup password')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Backup password'), 'correct horse battery staple');
    fireEvent.changeText(view.getByLabelText('Confirm backup password'), 'different password');
    expect(view.getByText('The backup passwords do not match.')).toBeTruthy();
    expect(view.getByLabelText('Export Finova backup').props.accessibilityState).toEqual({ disabled: true });

    fireEvent.changeText(view.getByLabelText('Confirm backup password'), 'correct horse battery staple');
    fireEvent.press(view.getByLabelText('Export Finova backup'));
    await waitFor(() => expect(ports.exportEncryptedBackup).toHaveBeenCalledWith(
      expect.any(Object),
      'correct horse battery staple',
    ));
    expect(view.getByLabelText('Backup password').props.value).toBe('');
    expect(view.getByLabelText('Confirm backup password').props.value).toBe('');
  });
});
