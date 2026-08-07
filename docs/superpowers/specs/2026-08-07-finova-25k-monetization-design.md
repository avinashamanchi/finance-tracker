# Finova 25k MAU monetization and data foundation design

Date: 2026-08-07
Status: approved direction

## Outcome

Prepare Finova for 25,000 monthly active users without turning a private local ledger into an account-backed service. Core entry, review, monthly totals, and portable backup remain useful for free. Finova Plus is a one-time Apple non-consumable, mediated by RevenueCat, that unlocks deeper local tools without a recurring charge.

The launch wave is iOS-first and local-first. It has no required account, Finova cloud API, bank connection, ads, behavioral analytics, or remote finance-data processing. Optional Apple-private iCloud sync is a separate post-launch design and release wave; no sync dependency, container, entitlement, copy, or incomplete toggle ships in this wave.

Twenty-five thousand MAU is an operating target, not permission to collect usage data. Release health is measured through App Store/RevenueCat aggregate operational consoles, opt-in privacy-safe support bundles, deterministic test fixtures, and explicit device performance gates.

## Existing state and required corrections

The native Expo SDK 54 app already has a useful local transaction/budget foundation and uncommitted RevenueCat purchase work. Keep those changes intact and evolve their interfaces. The current implementation is not yet the 25k foundation because it:

- executes one `CREATE_SCHEMA_SQL` blob and sets `user_version = 1` instead of running ordered, atomic migrations;
- validates repository behavior only through an in-memory substitute, not a real SQLite engine;
- loads all transactions into React state and reloads the full ledger after every write;
- searches and aggregates the full in-memory array;
- assumes USD cents without an explicit ledger or currency identity;
- treats a recurring checkbox as a fact but has no recurrence template or expected-bill lifecycle;
- buffers a version-1 JSON backup and caps it at 1 MiB;
- describes the product as having no third party while RevenueCat necessarily handles anonymous purchase metadata; and
- leaves a legacy Create React App login path that stores plaintext passwords in browser storage and still has a deploy script.

## Product and monetization contract

### Free

- Unlimited local transactions in the active ledger.
- Keyset-paginated transaction list and full-text search.
- Current-month totals and category spending.
- Up to three active budget categories.
- Unencrypted JSON import compatibility for existing version-1 backups.
- Encrypted portable Finova backup export/import.
- Delete All Data and privacy-safe support diagnostics.

### Finova Plus

- Unlimited active budget categories.
- Six-month SQL-backed insights.
- CSV export.
- Recurring monthly templates and expected-bill status.
- Budget rollover.
- Savings goals and contribution history.

The product is `com.avinashamanchi.finova.plus.lifetime`; the RevenueCat entitlement is `finova_plus`. It is an Apple non-consumable and never a subscription. The UI displays only StoreKit's localized price and must not infer, cache as copy, or hard-code a storefront price. Free data is never hidden or deleted when entitlement state is unavailable.

The native SDK owns purchase truth. Finova never writes an `isPlus` preference. Entitlement state is `active`, `inactive`, or `unknown`; `unknown` preserves access already authoritatively activated during the current process but does not grant a new unlock. Refresh occurs on launch, app foreground, RevenueCat customer-info listener events, successful purchase, and explicit Restore Purchases. Restore remains visible without login. Purchase cancellation is neutral, interruption is retryable, and purchase/restore operations are single-flight.

RevenueCat is configured anonymously. Finova sends no ledger rows, descriptions, amounts, categories, backup contents, diagnostics, contact data, or custom user attributes to RevenueCat. Accurate privacy copy states that RevenueCat and Apple process an anonymous app-user identifier, purchase/product/entitlement data, and technical request metadata needed to provide and restore the purchase. Delete All cannot cancel, refund, or erase Apple's purchase record; it clears Finova data and transient files, then refreshes the Apple-linked entitlement.

## Architecture

The native app remains the only product surface. Screens call focused controllers; controllers call repositories; repositories own SQL. No screen issues SQL or builds an all-ledger snapshot for routine display.

```text
Expo Router screens
  -> LedgerController / PlanningController / BillingController
    -> SQLite repositories (paged rows, SQL aggregates, FTS5)
    -> RevenueCat adapter (purchase metadata only)
    -> Portable backup pipeline (user-selected file only)
```

The legacy web login/PWA is quarantined under `legacy-web/`, excluded from root build/deploy scripts, and labeled unsafe and unsupported. It is neither a migration source nor a browser version of Finova. Public privacy, terms, and support pages remain publishable as static legal artifacts.

## Ledger and currency identity

Launch uses one active ledger but stores an immutable ledger identity so future export, multiple-ledger, and Apple-private sync work does not have to reinterpret ownerless rows.

`ledgers` contains:

- `id`: UUID primary key;
- `name`: trimmed 1-60 code points, initially `Personal`;
- `currency_code`: uppercase ISO 4217 code;
- `currency_minor_unit`: integer 0-3;
- `created_at` and `updated_at`: ISO timestamps.

Every transaction, budget, recurring template, and savings goal carries `ledger_id`. Monetary columns are renamed to `*_minor`; formatting and parsing use the ledger's currency and minor-unit count. Launch creates one USD ledger because the existing mobile implementation explicitly formats every value as USD cents. Migration does not claim conversion. Currency is immutable once a ledger has financial rows; changing currency requires a new ledger in a future product wave.

Transaction IDs remain UUIDs. Stable ordering is `(occurred_on DESC, created_at DESC, id DESC)`. A cursor contains exactly those three values and is opaque outside the data package.

## Ordered SQLite migrations

Replace the schema blob with a monotonic `MIGRATIONS` registry. Initialization reads `PRAGMA user_version`, rejects a database newer than the app, and applies each missing migration in its own exclusive transaction. A migration updates `user_version` only after all schema/data changes succeed. It never catches and advances past a failed step.

Migration 1 reproduces the historical transaction and budget schema for a fresh or fixture database. Migration 2 creates the ledger, rebuilds transaction/budget tables with `ledger_id` and `*_minor`, preserves all valid version-1 rows, creates compound indexes, and installs an external-content FTS5 table with insert/update/delete triggers. Migration 3 creates recurring templates and expected occurrences. Migration 4 creates month-specific budget plans/rollover fields and savings goals/contributions.

Real SQLite integration tests use Node 22's `node:sqlite` against in-memory databases and the same SQL statements shipped to Expo. They exercise fresh install, every historical start version, idempotent reopen, row preservation, foreign keys, FTS triggers, failed-migration rollback, and too-new-version rejection. In-memory repository tests remain useful contract tests but are not migration evidence.

## Query and state model

`listTransactionsPage(query)` returns at most 50 rows and an optional next cursor. It uses keyset pagination, never offset pagination. Empty search uses the compound ordering index. Search normalizes a bounded user query into escaped FTS5 prefix tokens and joins matching row IDs; invalid or punctuation-only input returns the normal first page rather than interpolating SQL.

Monthly totals, category totals, six-month points, budget usage, expected bills, and goal progress are SQL aggregate queries. Integer range checks run when mapping aggregate results. Routine app launch loads the active ledger, first transaction page, current-month summary, budgets, expected bills, and goals; it never calls `snapshot()`.

Controllers keep bounded page state. Creating, updating, or deleting a transaction re-fetches the first page and affected aggregate cards; it does not reload all rows. Loading more appends one page and deduplicates by ID. Query/filter changes cancel or invalidate stale page requests. Backup/CSV export iterate repository pages directly and do not hydrate React state.

## Recurring templates and expected bills

A recurring template is an instruction, not a posted transaction. Launch recurrence is monthly, which matches the existing product's bills language and avoids an unreviewed general calendar engine. A template stores UUID, ledger ID, description, expense category, amount in minor units, due day 1-31, start month, optional end month, enabled state, and timestamps. For short months, day 29-31 resolves to the month's last calendar day.

Expected occurrences are materialized idempotently for the previous, current, and next two months with unique `(template_id, due_on)`. Status is derived as `upcoming`, `due`, `overdue`, or `recorded`. Recording an occurrence opens a prefilled transaction editor; the transaction and occurrence link are written in one exclusive transaction. Finova never auto-posts spending and never sends notifications in this wave. Disabling/deleting a template leaves already-recorded transactions untouched.

Legacy `is_recurring = 1` rows remain ordinary historical transactions. Migration does not infer a template or due date from them.

## Budgets, rollover, and savings goals

Budgets become month-specific plans keyed by `(ledger_id, category_id, month)`. A plan has `limit_minor` and rollover policy `none` or `carry_unused`. `carry_unused` adds only positive unused funds from the immediately preceding month's base limit; carried funds do not compound into another month's carry, and overspending never creates negative carry. If the previous month has no plan, carry is zero. Recalculation is query-derived from authoritative transactions so backdated edits do not leave stale rollover values.

The existing timeless budget becomes a current-month plan during migration. Free users may retain and view all migrated plans but cannot activate a fourth category. Entitlement loss or unknown state never deletes a plan.

A savings goal stores UUID, ledger ID, name, target amount, optional target date, archived state, and timestamps. Contributions are manual positive adjustments with UUID, goal ID, amount, date, optional note, and timestamp. Goal progress is the SQL sum of contributions, not inferred from bank balances or transaction categories. Finova labels it recorded progress, not money set aside or a forecast.

## Portable encrypted backups

Version-2 `.finova` backup is the default portable format. It is password-encrypted and authenticated using a reviewed library implementation: scrypt derives a 32-byte key from a 16-byte random salt, and XChaCha20-Poly1305 encrypts independently authenticated 64 KiB frames with a 24-byte nonce derived from a random prefix plus a monotonically increasing frame counter. The authenticated header fixes format version, KDF/cipher names and parameters, salt, nonce prefix, frame size, and ledger record counts. Passwords are 12-128 Unicode code points, are never persisted or logged, and mutable key/password buffers are zeroed after success or failure.

Plaintext inside frames is versioned newline-delimited JSON: one manifest followed by ledger, transaction, budget plan, recurring template/occurrence, goal, and contribution records. Export reads ordered 500-row repository pages and writes binary frames through a file handle. Import enforces a 50 MiB encrypted-file limit before reading, bounds every frame and record, authenticates before parsing, validates strict schemas, and writes to staging tables. Only after EOF, declared-count checks, foreign-key checks, and full validation pass does one exclusive transaction replace active data. Wrong password, tampering, truncation, unsupported version, duplicate IDs, unknown record kinds, or any staging failure leaves active data unchanged.

Version-1 JSON import remains read-only compatibility. New plaintext JSON exports are removed. The UI explicitly says Finova cannot recover the password and that the chosen share destination controls its copy.

## Diagnostics, deletion, and artifacts

Support diagnostics are generated only after a user action and previewed before sharing. They may include app/build/OS versions, schema version, row counts, database-size bucket, migration state, feature availability, bounded performance timings, and stable error codes. They never include descriptions, amounts, exact transaction dates, categories, UUIDs, RevenueCat identifiers, file paths, search text, backup headers, or secrets. There is no automatic telemetry upload.

All export/import/diagnostic files live in one app-owned cache namespace with a strict extension allowlist. Success, failure, cancellation, startup, and Delete All attempt cleanup. Delete All invalidates outstanding reads, closes import/export handles, clears every finance/planning table and staging table in one exclusive transaction, checkpoints/truncates WAL where supported, clears app-owned preferences, and removes the artifact namespace. Partial subsystem failure is named and retryable. It does not report Apple purchase deletion.

## Privacy and optional iCloud sync boundary

Launch requires no account and keeps finance content on device except files the user explicitly exports. RevenueCat/Apple receive only purchase-service data described above. No custom diagnostics, analytics, ad, attribution, crash-reporting, or remote logging SDK is added.

Apple-private iCloud sync is deliberately absent from this launch plan. A future spec must choose CloudKit container/record ownership, conflict resolution, tombstones, encryption and Advanced Data Protection wording, account-change behavior, quotas, deletion semantics, migration, and device-pair tests. Until those decisions and Apple entitlements are complete, the app must not say data syncs or is backed up by Finova. Apple's device backup behavior remains a separate platform boundary disclosed in privacy copy.

## Large-ledger and release gates

Automated fixtures contain 100,000 transactions across 120 months, 180 budget plans, 120 templates, and 50 goals. CI verifies query plans use the ordering/month/FTS indexes, each page holds at most 50 rows, controller state holds at most 200 transaction rows, exports iterate in 500-row chunks, and no routine screen calls `snapshot()` or `listTransactions()`.

On the oldest supported physical iPhone class selected for release, a release build must meet these measured p95 gates over ten runs after one warm-up: database open plus migrations at current schema under 750 ms, first transaction page under 250 ms, FTS search under 300 ms, current-month aggregates under 200 ms, and interaction response without a main-thread stall over 100 ms. Peak resident memory during encrypted export/import of the 100,000-row fixture must remain under 250 MiB. Measurements are recorded with device model, iOS version, build ID, and fixture digest; simulator or Node timings cannot satisfy the physical-device gate.

External release gates remain explicitly unchecked until authoritative evidence exists:

- Apple Paid Apps Agreement, banking, and tax state;
- exact non-consumable creation/localization/review assets in App Store Connect;
- RevenueCat Apple app, product, offering, and `finova_plus` mapping;
- public Apple SDK key in credentialed EAS environments, with no secret key in source;
- sandbox purchase, cancellation, interruption, already-owned, listener refresh, reinstall, and restore;
- signed TestFlight candidate repeating the complete purchase and large-ledger checks;
- App Privacy answers and public privacy/terms/support pages matching RevenueCat and encrypted-export behavior;
- VoiceOver, Dynamic Type through 200%, keyboard, Reduced Motion, and smallest-supported-device checks; and
- App Review submission, approval, and public listing.

Local code, green tests, RevenueCat dashboard setup, or an uploaded build is not proof of publication.

## Explicit non-goals

- Required login, email identity, or Finova account recovery.
- Finova-hosted sync or remote finance-data storage.
- iCloud/CloudKit sync in the launch wave.
- Bank connections, transaction import feeds, payments, money movement, advice, forecasts, AI, notifications, ads, or behavioral analytics.
- Subscription pricing, trials, introductory offers, promo entitlement logic, or Android billing.
- Automatic recurring transaction posting or claims that a goal contribution moved money.
