# Finova iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a local-first Expo iOS personal finance tracker that exercises every core flow in Expo Go and has truthful App Store release materials.

**Architecture:** A separate `mobile/` Expo Router app uses focused domain functions, a single `expo-sqlite` repository, and presentation screens that never issue SQL. A versioned backup service, cache-artifact owner, and coordinated deletion service keep data boundaries explicit. The existing web client remains unchanged except for repository-level documentation and CI.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, TypeScript, Expo SQLite, Expo File System, Expo Sharing, Zod, Jest, React Native Testing Library, Maestro, GitHub Actions.

## Global Constraints

- All core flows must work in Expo Go; no core feature may require a development build.
- Persist money only as positive safe-integer cents and perform calculations in integer cents.
- Store finance data locally unless the user explicitly exports or shares it.
- Default to an empty ledger; do not fabricate user finance data.
- Request no contacts, photos, location, microphone, camera, health, banking, advertising, or tracking permission.
- Do not claim financial, tax, legal, credit, investment, fraud-detection, bank-grade-security, or outcome guidance.
- Validate a byte-bounded JSON backup completely before atomic replacement.
- Keep App Store submission, review, approval, and publication external and unchecked until observed.

---

### Task 1: Expo foundation and deterministic finance domain

**Files:**
- Create: `mobile/package.json`, `mobile/package-lock.json`, `mobile/app.json`, `mobile/eas.json`, `mobile/tsconfig.json`, `mobile/eslint.config.js`, `mobile/jest.setup.ts`
- Create: `mobile/src/domain/types.ts`, `mobile/src/domain/categories.ts`, `mobile/src/domain/money.ts`, `mobile/src/domain/summaries.ts`
- Create: `mobile/__tests__/money.test.ts`, `mobile/__tests__/summaries.test.ts`, `mobile/__tests__/releaseConfig.test.ts`

**Interfaces:**
- Produces: `parseAmountToCents(input: string): MoneyParseResult`, `formatCents(cents: number): string`, `summarizeMonth(transactions: Transaction[], month: string): MonthSummary`, `buildSixMonthTrend(transactions: Transaction[], anchorMonth: string): MonthlyPoint[]`.
- Produces: `Transaction`, `TransactionDraft`, `Budget`, `MonthSummary`, `MonthlyPoint`, and the immutable category catalog.

- [ ] **Step 1: Write failing money, summary, and configuration tests**

```ts
expect(parseAmountToCents('12.34')).toEqual({ ok: true, cents: 1234 });
expect(parseAmountToCents('1.999').ok).toBe(false);
expect(summarizeMonth(fixtures, '2026-08').balanceCents).toBe(4250);
expect(expo.ios.bundleIdentifier).toBe('com.avinashamanchi.finova');
```

- [ ] **Step 2: Run the tests and verify missing modules/config fail**

Run: `cd mobile && npm test -- --runInBand __tests__/money.test.ts __tests__/summaries.test.ts __tests__/releaseConfig.test.ts`
Expected: FAIL because the domain and configuration files do not exist.

- [ ] **Step 3: Implement the smallest deterministic domain and credential-free Expo configuration**

```ts
export type Transaction = Readonly<{
  id: string; kind: 'income' | 'expense'; amountCents: number;
  categoryId: string; description: string; occurredOn: string;
  isRecurring: boolean; createdAt: string; updatedAt: string;
}>;
```

Use explicit decimal-string parsing rather than floating-point multiplication. Reject signs, exponent notation, more than two fractional digits, zero, and values above `Number.MAX_SAFE_INTEGER` cents.

- [ ] **Step 4: Run focused tests, typecheck, and lint**

Run: `cd mobile && npm test -- --runInBand __tests__/money.test.ts __tests__/summaries.test.ts __tests__/releaseConfig.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "feat: establish Finova mobile foundation"
```

### Task 2: SQLite repository and atomic data ownership

**Files:**
- Create: `mobile/src/data/schema.ts`, `mobile/src/data/financeRepository.ts`, `mobile/src/data/FinanceProvider.tsx`
- Create: `mobile/src/data/inMemoryFinanceRepository.ts`
- Create: `mobile/__tests__/financeRepository.test.ts`, `mobile/__tests__/financeProvider.test.tsx`

**Interfaces:**
- Consumes: domain `Transaction`, `TransactionDraft`, `Budget`, and summary functions.
- Produces: `FinanceRepository` with `initialize`, `listTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction`, `listBudgets`, `setBudget`, `replaceAll`, and `deleteAll`.
- Produces: `useFinance(): FinanceController`, including reload and stable mutation methods.

- [ ] **Step 1: Write failing migration, CRUD, budget, and provider race tests**

```ts
await repository.initialize();
const created = await repository.createTransaction(validDraft);
expect(await repository.listTransactions()).toEqual([created]);
await expect(repository.replaceAll(invalidSnapshot)).rejects.toThrow();
```

Include tests proving idempotent initialization, invalid category rejection, edit/delete behavior, stable ordering, rollback on failed replacement, and stale reload suppression after Delete All.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd mobile && npm test -- --runInBand __tests__/financeRepository.test.ts __tests__/financeProvider.test.tsx`
Expected: FAIL because the repository/provider do not exist.

- [ ] **Step 3: Implement repository boundaries and provider**

```ts
export interface FinanceRepository {
  initialize(): Promise<void>;
  listTransactions(): Promise<Transaction[]>;
  createTransaction(draft: TransactionDraft): Promise<Transaction>;
  updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  listBudgets(): Promise<Budget[]>;
  setBudget(categoryId: ExpenseCategoryId, limitCents: number): Promise<Budget>;
  replaceAll(snapshot: FinanceSnapshot): Promise<void>;
  deleteAll(): Promise<void>;
}
```

SQLite implementation uses bound parameters and `withTransactionAsync`; tests use the contract-compatible in-memory implementation.

- [ ] **Step 4: Run focused and domain tests**

Run: `cd mobile && npm test -- --runInBand __tests__/financeRepository.test.ts __tests__/financeProvider.test.tsx __tests__/money.test.ts __tests__/summaries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/data mobile/__tests__
git commit -m "feat: add local finance repository"
```

### Task 3: Backup, CSV export, artifact cleanup, and Delete All

**Files:**
- Create: `mobile/src/services/backup.ts`, `mobile/src/services/csv.ts`, `mobile/src/services/artifacts.ts`, `mobile/src/services/deleteAllData.ts`
- Create: `mobile/__tests__/backup.test.ts`, `mobile/__tests__/csv.test.ts`, `mobile/__tests__/artifacts.test.ts`, `mobile/__tests__/deleteAllData.test.ts`

**Interfaces:**
- Consumes: `FinanceRepository` and versioned domain snapshot.
- Produces: `parseBackup(raw: string): FinanceSnapshot`, `serializeBackup(snapshot): string`, `transactionsToCsv(transactions): string`, `ArtifactStore`, and `deleteAllAppData(dependencies): DeleteAllResult`.

- [ ] **Step 1: Write failing boundary tests**

```ts
expect(parseBackup(validV1)).toEqual(snapshot);
expect(() => parseBackup('{"version":2}')).toThrow('unsupported');
expect(transactionsToCsv([commaFixture])).toContain('"Lunch, team"');
expect(await deleteAllAppData(deps)).toEqual({ ok: false, failed: ['artifacts'] });
```

Cover the 1 MiB UTF-8 backup limit, unknown keys, duplicate IDs, unsafe cents, invalid dates/categories, atomic replacement, CSV formula-prefix neutralization, share cancellation, and retry after partial deletion.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd mobile && npm test -- --runInBand __tests__/backup.test.ts __tests__/csv.test.ts __tests__/artifacts.test.ts __tests__/deleteAllData.test.ts`
Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement strict services**

```ts
const BackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  transactions: z.array(TransactionSchema).max(10_000),
  budgets: z.array(BudgetSchema).max(EXPENSE_CATEGORIES.length),
}).strict();
```

Create artifacts only beneath `Paths.cache/finova-artifacts`, remove them in `finally`, and never interpret share-sheet return as proof that another app received data.

- [ ] **Step 4: Run focused tests and full service coverage**

Run: `cd mobile && npm test -- --runInBand __tests__/backup.test.ts __tests__/csv.test.ts __tests__/artifacts.test.ts __tests__/deleteAllData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services mobile/__tests__
git commit -m "feat: add private finance data controls"
```

### Task 4: Navigation, dashboard, transactions, budgets, and insights

**Files:**
- Create: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/transactions.tsx`, `mobile/app/(tabs)/budgets.tsx`, `mobile/app/(tabs)/settings.tsx`
- Create: `mobile/app/transaction/new.tsx`, `mobile/app/transaction/[id].tsx`, `mobile/app/insights.tsx`
- Create: `mobile/src/components/Screen.tsx`, `mobile/src/components/MetricCard.tsx`, `mobile/src/components/TransactionRow.tsx`, `mobile/src/components/BudgetRow.tsx`, `mobile/src/components/TrendBars.tsx`, `mobile/src/components/EmptyState.tsx`
- Create: `mobile/src/design/tokens.ts`, `mobile/src/screens/TransactionEditor.tsx`
- Create: `mobile/__tests__/navigation.test.tsx`, `mobile/__tests__/dashboard.test.tsx`, `mobile/__tests__/transactionsFlow.test.tsx`, `mobile/__tests__/budgetsFlow.test.tsx`, `mobile/__tests__/insights.test.tsx`, `mobile/__tests__/accessibility.test.tsx`

**Interfaces:**
- Consumes: `useFinance`, domain formatters, and summary functions.
- Produces: four-tab navigation and the complete ledger/budget/insight UI.

- [ ] **Step 1: Write failing screen-flow and accessibility tests**

```tsx
fireEvent.press(getByLabelText('Add transaction'));
fireEvent.changeText(getByLabelText('Amount'), '42.15');
fireEvent.press(getByLabelText('Save transaction'));
await waitFor(() => expect(repository.listTransactions()).resolves.toHaveLength(1));
```

Assert empty/filtered-empty states, add/edit/delete confirmation, budget validation, month switching, numeric trend summaries, 44-point targets, roles, labels, safe-area wrappers, and error retry.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd mobile && npm test -- --runInBand __tests__/navigation.test.tsx __tests__/dashboard.test.tsx __tests__/transactionsFlow.test.tsx __tests__/budgetsFlow.test.tsx __tests__/insights.test.tsx __tests__/accessibility.test.tsx`
Expected: FAIL because screens/components do not exist.

- [ ] **Step 3: Implement the native UI with semantic controls**

Use `FlatList` for transactions, `KeyboardAvoidingView` for editors, `Alert` only for concise confirmations, visible inline validation, and text labels alongside status colors. Keep screen files as composition layers; validation remains in domain/services.

- [ ] **Step 4: Run screen, domain, repository, and service tests**

Run: `cd mobile && npm test -- --runInBand`
Expected: PASS with no open handles.

- [ ] **Step 5: Commit**

```bash
git add mobile/app mobile/src/components mobile/src/design mobile/src/screens mobile/__tests__
git commit -m "feat: build Finova iOS experience"
```

### Task 5: Settings, privacy, support, and phone acceptance flow

**Files:**
- Create: `mobile/app/privacy.tsx`, `mobile/app/support.tsx`, `mobile/src/screens/SettingsScreen.tsx`
- Create: `mobile/e2e/ios-core-flow.yaml`
- Create: `mobile/__tests__/settingsFlow.test.tsx`, `mobile/__tests__/policyContent.test.tsx`, `mobile/__tests__/maestroFlow.test.ts`

**Interfaces:**
- Consumes: backup/export/artifact/deletion services and `useFinance`.
- Produces: explicit user-controlled data egress/deletion and in-app policy surfaces.

- [ ] **Step 1: Write failing settings and policy tests**

```tsx
expect(getByText(/stays on this device/i)).toBeTruthy();
fireEvent.changeText(getByLabelText('Delete confirmation'), 'DELETE');
expect(getByLabelText('Delete all data')).toBeEnabled();
```

Assert device-backup restoration wording, no-advice wording, no tracking/bank sync, import replacement confirmation, share cancellation language, and semantic IDs used by Maestro.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd mobile && npm test -- --runInBand __tests__/settingsFlow.test.tsx __tests__/policyContent.test.tsx __tests__/maestroFlow.test.ts`
Expected: FAIL because the settings/policy surfaces do not exist.

- [ ] **Step 3: Implement settings and the deterministic Maestro journey**

The journey adds an expense, edits its budget, observes Home, opens Insights, exports CSV to the share sheet, returns without asserting delivery, and deletes all data with `DELETE`.

- [ ] **Step 4: Run focused tests and then all mobile tests**

Run: `cd mobile && npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/app mobile/src/screens mobile/e2e mobile/__tests__
git commit -m "feat: complete Finova privacy controls"
```

### Task 6: App Store assets, truthful metadata, and automated gates

**Files:**
- Create: `mobile/assets/icon.png`, `mobile/assets/adaptive-icon.png`, `mobile/assets/splash-icon.png`
- Create: `.github/workflows/ios-ci.yml`, `.github/workflows/release-readiness.yml`
- Create: `scripts/scan-secrets.mjs`
- Create: `docs/app-store/metadata-draft.json`, `docs/app-store/privacy-draft.md`, `docs/app-store/review-notes-draft.md`, `docs/app-store/screenshot-matrix.md`, `docs/app-store/finova-ios-release-checklist.md`
- Create: `mobile/__tests__/publication.test.ts`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Consumes: the full mobile app and external-gate vocabulary.
- Produces: credential-free verification workflows and a complete, non-submitted release packet.

- [ ] **Step 1: Write failing publication tests**

```ts
expect(readPngHeader(icon)).toEqual({ width: 1024, height: 1024, colorType: 2 });
expect(metadata.name.length).toBeLessThanOrEqual(30);
expect(releaseWorkflow).toContain('workflow_dispatch');
expect(releaseWorkflow).not.toMatch(/eas submit|ascApiKey|appleId/);
```

Assert metadata limits, privacy/support claims, screenshot canvas choices, manual release workflow, Node 22, clean install, tests, typecheck, lint, Doctor, audit, iOS export, native prebuild, YAML parsing, and secret scan.

- [ ] **Step 2: Run publication tests and verify failure**

Run: `cd mobile && npm test -- --runInBand __tests__/publication.test.ts`
Expected: FAIL because release assets and materials do not exist.

- [ ] **Step 3: Generate an opaque original icon and implement release materials/workflows**

The icon must be a unique Finova ledger/compass mark, 1024×1024, RGB PNG, without text or transparency. Workflows may validate but never deploy, sign, upload, or submit.

- [ ] **Step 4: Run all local automated gates**

Run: `cd mobile && npm test -- --runInBand && npm run typecheck && npm run lint && npm run expo:doctor && npm run export:ios && npm audit --audit-level=high`
Expected: PASS and 0 vulnerabilities.

- [ ] **Step 5: Commit**

```bash
git add .github .gitignore README.md docs scripts mobile
git commit -m "chore: prepare Finova iOS release candidate"
```

### Task 7: Exact clean-clone release verification

**Files:**
- Modify: `docs/app-store/finova-ios-release-checklist.md`

**Interfaces:**
- Consumes: the exact committed candidate.
- Produces: reproducible evidence with external gates left unchecked.

- [ ] **Step 1: Clone without hardlinks and install only from lockfiles**

```bash
audit_dir="$(mktemp -d /tmp/finova-release.XXXXXX)"
git clone --no-hardlinks . "$audit_dir/finance-tracker"
cd "$audit_dir/finance-tracker/mobile"
npm ci
```

- [ ] **Step 2: Run the complete release suite in the clean clone**

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run expo:doctor
npm run export:ios
npm audit --audit-level=high
npx expo prebuild --platform ios --no-install --clean
git diff --exit-code -- package.json package-lock.json
```

Also parse every workflow YAML, run the redacted secret scanner, confirm the icon is 1024×1024 without alpha, and confirm the clone remains free of tracked changes.

- [ ] **Step 3: Record exact counts, SHA, warnings, and machine limitations**

Do not mark physical device, Xcode compile, signing, screenshot, TestFlight, App Review, approval, or publication gates complete.

- [ ] **Step 4: Commit the evidence-only documentation update**

```bash
git add docs/app-store/finova-ios-release-checklist.md
git commit -m "docs: record Finova clean-checkout evidence"
```

- [ ] **Step 5: Confirm final source status**

Run: `git status --short && git log -3 --oneline`
Expected: empty status and evidence commit at HEAD.
