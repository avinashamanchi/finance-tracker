import { deleteAllAppData } from '../src/services/deleteAllData';

describe('Delete All Data coordination', () => {
  it('attempts every owned subsystem and reports success', async () => {
    const calls: string[] = [];
    const result = await deleteAllAppData({
      finance: { deleteAll: async () => { calls.push('finance'); } },
      artifacts: { cleanupAll: async () => { calls.push('artifacts'); } },
      preferences: { clear: async () => { calls.push('preferences'); } },
    });
    expect(calls).toEqual(['finance', 'artifacts', 'preferences']);
    expect(result).toEqual({ ok: true, failed: [], retryable: false });
  });

  it('continues after failures and returns retryable subsystem names', async () => {
    const preferences = jest.fn(async () => {});
    const result = await deleteAllAppData({
      finance: { deleteAll: async () => { throw new Error('db'); } },
      artifacts: { cleanupAll: async () => { throw new Error('files'); } },
      preferences: { clear: preferences },
    });
    expect(preferences).toHaveBeenCalled();
    expect(result).toEqual({ ok: false, failed: ['finance', 'artifacts'], retryable: true });
  });
});
