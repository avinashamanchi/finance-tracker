import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

describe('bounded production UI contract', () => {
  it('does not call legacy full-ledger snapshot or CSV loaders from routes or screens', () => {
    const roots = [join(__dirname, '../app'), join(__dirname, '../src/screens')];
    const source = roots.flatMap(sourceFiles).map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(source).not.toMatch(/\.snapshot\s*\(/);
    expect(source).not.toMatch(/readTransactionsForCsv\s*\(/);
    expect(source).not.toMatch(/\.listTransactions\s*\(/);
  });

  it('keeps keyset paging and bounded controller windows', () => {
    const query = readFileSync(join(__dirname, '../src/data/transactionQueries.ts'), 'utf8');
    const provider = readFileSync(join(__dirname, '../src/data/FinanceProvider.tsx'), 'utf8');
    expect(query).not.toMatch(/\bOFFSET\b/i);
    expect(query).toMatch(/LIMIT \?/);
    expect(provider).toContain('const PAGE_SIZE = 50');
    expect(provider).toContain('const MAX_WINDOW = 200');
  });
});
