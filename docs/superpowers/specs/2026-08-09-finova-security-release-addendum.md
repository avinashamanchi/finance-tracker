# Finova Security, Capacity, and App Review Addendum

**Status:** Approved through the owner's standing approval on 2026-08-09.
**Extends:** `2026-08-07-finova-25k-monetization-design.md`.

## Outcome and claims

Finova remains local-only for its first release. There is no app-owned account or ledger backend to scale: 25,000 MAU and 1,000 simultaneous active users are isolated across devices, while Apple/RevenueCat handle distribution and purchase infrastructure. The security focus is local financial-data integrity, bounded queries, safe import/export, encrypted backup, complete deletion, and honest one-time-purchase state.

## Selected approach

Keep SQLite as the ledger authority and finish the approved bounded repository, planning, encrypted streaming backup, diagnostics, deletion, billing, and UI tasks. Do not add a cloud account merely to satisfy a generic scalability checklist.

## Trust boundaries and required controls

- Treat every imported file, document URI, CSV cell, backup field, migration row, and RevenueCat response as untrusted.
- All SQL values use bound parameters. Dynamic sort/filter clauses come only from closed enums. Reads are paginated and aggregates execute in SQL; no screen may materialize the full ledger.
- Amounts stay exact integer minor units with safe-integer and currency-minor-unit validation. IDs, timestamps, recurrence rules, and cursor tuples are canonical and bounded.
- CSV export neutralizes spreadsheet formulas and streams bounded pages. Artifacts live only in an owned cache namespace, use unguessable names, and are deleted after sharing or failure.
- Replace plaintext v1 JSON as the flagship backup with versioned authenticated encryption and streaming limits. Wrong passwords, tampering, truncation, oversized fields, and partial files must fail without changing the ledger.
- Diagnostics are explicit opt-in and content-free. Complete deletion covers SQLite rows/files, journals, preferences, cached artifacts, temporary imports/exports, backup keys, and billing identifiers where the SDK permits.
- Plus state comes from RevenueCat and fails to `unknown`, not active. Downgrades never delete user data; purchase and restore are serialized and recoverable.

## Capacity and failure design

- The device gate uses the approved 100,000-row fixture with bounded bidirectional paging, indexed search, SQL aggregates, and explicit export/backup size behavior.
- Long operations are cancellable, show progress, yield to rendering, and clean partial artifacts. Low-storage, interruption, app restart, and migration races are tested.
- Billing outages do not block the free ledger. Plus-only creation gates are conservative while existing user data remains readable.

## App Store release design

- Finova Plus is a digital lifetime unlock and uses Apple IAP through RevenueCat. The UI includes Restore Purchases and accurately distinguishes active, inactive, unknown, preview, and configuration states.
- The app does not claim bank connectivity, investment advice, tax advice, automatic payment, cloud sync, or encrypted backup until that exact feature is shipped and verified.
- Privacy/terms/support pages state that ledger data is local, describe optional RevenueCat purchase data, document exports/backups, and provide contact/deletion instructions.
- Screenshots use fictional finances and clearly mark Plus-only functionality. No real account balances or personal data are used.
- Signed Xcode 26 archive, privacy report, VoiceOver/Dynamic Type, 100,000-row physical-device test, TestFlight purchase/restore, and public legal links remain external gates.

## Verification order

1. Complete the exact recurring/budget/rollover/goal model from Task 4 of the approved plan.
2. Add failing tamper, wrong-password, path/artifact, partial-write, cancellation, deletion, and billing-lifecycle tests before the encrypted streaming implementation.
3. Wire every bounded repository feature into the phone UI; remove remaining snapshot/full-ledger reads.
4. Run full tests, SQLite large-fixture/resource gates, secret/dependency scans, Expo export, and signed-device/App Store evidence separately.

## Non-goals

No bank credentials, account aggregation, brokerage, tax filing, cloud ledger, custom payment processing, background financial advice, or claim that purchase infrastructure scales the local database.
