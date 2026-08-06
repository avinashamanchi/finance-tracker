# Finova iOS design

Date: 2026-08-06
Status: approved through the user's standing instruction to use the recommended plan and complete all four iOS projects

## Outcome

Build a genuinely phone-usable, local-first iOS personal finance tracker alongside the existing web client. The app must run in Expo Go for all core product flows and be structurally ready for a later credentialed EAS/TestFlight/App Store process. Local implementation is not evidence of signing, device testing, submission, approval, or publication.

## Chosen approach

Use a separate Expo/React Native application in `mobile/`. A Capacitor wrapper was rejected because the current UI is desktop-oriented and the Create React App dependency tree has material known vulnerabilities. A hosted WebView was rejected because it would weaken offline behavior, privacy boundaries, and native interaction quality.

The existing web client remains intact. It is not a source of truth for mobile data and there is no implicit browser-to-phone migration.

## Product scope

The first iOS release includes:

- an empty-by-default local ledger;
- income and expense transactions with description, category, date, amount, and optional recurring marker;
- transaction add, edit, search, filter, and confirmed deletion;
- monthly category budgets with progress, near-limit, and over-limit states;
- a dashboard with income, expense, balance, savings rate, recent activity, and budget warnings;
- deterministic six-month income/expense/balance insights rendered with accessible native bars and summaries;
- JSON backup export and validated replacement import;
- CSV transaction export through the system share sheet;
- an explicit, retry-safe Delete All Data flow gated by the exact phrase `DELETE`;
- in-app privacy, support, data-boundary, and educational-limit content.

The release does not include accounts, authentication, cloud sync, bank connections, payments, investment execution, AI, ads, tracking, analytics, notifications, subscriptions, or financial advice.

## Navigation and interaction

Use four primary bottom tabs: Home, Transactions, Budgets, and Settings. Insights is reached from Home so tab targets stay readable on compact iPhones.

Home leads with the selected month's balance, then income/expense summaries, budget warnings, recent transactions, and a six-month insights card. Transactions has a prominent add control and a compact search/filter row. Transaction create/edit uses a dedicated screen with native inputs and explicit validation. Budgets lists expense categories with numeric progress and status text rather than relying on color alone. Settings owns export, import, privacy, support, sample-data controls if present, and destructive deletion.

Every interactive target is at least 44 points, supports Dynamic Type, has a semantic accessibility role/label, respects safe areas, and remains usable with the keyboard shown.

## Data model and persistence

Use `expo-sqlite` with a single repository boundary and idempotent migrations.

`transactions` fields:

- `id`: locally generated UUID;
- `kind`: `income` or `expense`;
- `amount_cents`: positive safe integer;
- `category_id`: value from the versioned category catalog;
- `description`: trimmed 1-120 code points;
- `occurred_on`: valid local calendar date in `YYYY-MM-DD`;
- `is_recurring`: boolean;
- `created_at` and `updated_at`: ISO timestamps.

`budgets` fields:

- `category_id`: expense category primary key;
- `limit_cents`: non-negative safe integer;
- `updated_at`: ISO timestamp.

All arithmetic uses integer cents. Formatting is presentation-only. The repository exposes focused transaction, budget, summary, backup, import, and delete operations. Screens never issue SQL directly.

## Backup, import, and deletion

Backups use a versioned JSON envelope containing only app-owned transactions and budgets. Import validates the entire byte-bounded payload before beginning a SQLite transaction, rejects unknown keys and unsupported versions, and replaces data atomically only after explicit confirmation. CSV export quotes fields correctly and never claims spreadsheet encryption.

Temporary export/import artifacts live only in an app-owned cache directory and are removed on success, failure, cancellation, and best-effort startup cleanup. Delete All invalidates active reads, removes all SQLite rows and app-owned artifacts, clears preferences, and reports partial failure with a retry action. Device backups may restore prior local data; the privacy copy states this limitation.

## Privacy and product claims

All finance data remains on the device unless the user explicitly exports or shares it. The app requests no contacts, photos, location, microphone, camera, health, banking, advertising, or tracking permissions. It contains no third-party analytics SDK.

The app is a record-keeping and visualization tool. Copy must not claim financial, tax, legal, credit, investment, fraud-detection, bank-grade-security, or outcome guidance. Calculations may be incomplete if data is missing or entered incorrectly.

## Error handling

Repository failures surface a stable user-facing message and a retry action without erasing input. Invalid amounts, dates, descriptions, categories, and imports fail before persistence. Writes use transactions where multiple records change. Empty, filtered-empty, loading, and error states are distinct. Share cancellation is not reported as a successful export.

## Verification and release boundary

Automated checks cover:

- money parsing and integer arithmetic boundaries;
- repository migrations and CRUD;
- monthly summaries, budgets, and six-month insights;
- import schema, byte limits, atomic replacement, and malicious/invalid input;
- CSV escaping and temporary-file cleanup;
- Delete All success, partial failure, and retry;
- screen flows, accessibility labels, empty states, validation, and navigation;
- configuration, opaque 1024×1024 icon, metadata limits, privacy claims, and external-gate wording;
- TypeScript, lint, Expo Doctor, production dependency audit, iOS export, workflow parsing, redacted secret scanning, and manifest-stable iOS prebuild from a clean clone.

Physical iPhone, VoiceOver, Dynamic Type, backup/restore, signed native build, screenshots, App Store Connect, TestFlight, review, approval, and public listing remain unchecked until authoritative evidence exists.
