import { buildDiagnostics } from '../src/services/diagnostics';

describe('content-free diagnostics', () => {
  it('copies only bounded operational fields and buckets database size', () => {
    const report = buildDiagnostics({
      appVersion: '1.2.0',
      buildNumber: '42',
      osVersion: 'iOS 26.0',
      schemaVersion: 4,
      counts: { transactions: 100_000, budgets: 180, templates: 120, goals: 50 },
      databaseBytes: 9_437_184,
      timingsMs: { firstPage: 84.4, aggregate: 31.2 },
      errorCodes: ['DB_OPEN_FAILED'],
      description: 'must not escape',
      fileUri: 'file:///private/ledger.db',
    });
    expect(report.databaseSizeBucket).toBe('8-16 MiB');
    expect(report.timingsMs).toEqual({ firstPage: 84, aggregate: 31 });
    expect(JSON.stringify(report)).not.toMatch(/description|amount|occurred|category|uuid|revenuecat|file:\/\//i);
    expect(report).not.toHaveProperty('fileUri');
  });

  it('rejects arbitrary error strings and impossible counters', () => {
    const base = {
      appVersion: '1.2.0', buildNumber: '42', osVersion: 'iOS 26.0', schemaVersion: 4,
      counts: { transactions: 1, budgets: 1, templates: 1, goals: 1 },
      databaseBytes: 1,
      timingsMs: { firstPage: 1, aggregate: 1 },
      errorCodes: ['DB_OPEN_FAILED'],
    };
    expect(() => buildDiagnostics({ ...base, errorCodes: ['User email is x@example.com'] }))
      .toThrow('diagnostic');
    expect(() => buildDiagnostics({ ...base, counts: { ...base.counts, transactions: -1 } }))
      .toThrow('diagnostic');
  });
});
