export type DeleteSubsystem = 'finance' | 'artifacts' | 'preferences';
export type DeleteAllResult = Readonly<{
  ok: boolean;
  failed: DeleteSubsystem[];
}>;

type Dependencies = Readonly<{
  finance: Readonly<{ deleteAll(): Promise<void> }>;
  artifacts: Readonly<{ cleanupAll(): Promise<void> }>;
  preferences: Readonly<{ clear(): Promise<void> }>;
}>;

export async function deleteAllAppData(dependencies: Dependencies): Promise<DeleteAllResult> {
  const operations: readonly (readonly [DeleteSubsystem, () => Promise<void>])[] = [
    ['finance', () => dependencies.finance.deleteAll()],
    ['artifacts', () => dependencies.artifacts.cleanupAll()],
    ['preferences', () => dependencies.preferences.clear()],
  ];
  const failed: DeleteSubsystem[] = [];
  for (const [name, operation] of operations) {
    try {
      await operation();
    } catch {
      failed.push(name);
    }
  }
  return { ok: failed.length === 0, failed };
}
