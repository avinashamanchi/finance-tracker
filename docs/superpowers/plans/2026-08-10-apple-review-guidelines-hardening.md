# Finova Apple Review Guidelines Hardening Plan

> **For implementation:** Execute each task in order with RED-before-production TDD and retain every credentialed release action as an external gate.

**Goal:** Align Finova's iOS package and reviewer materials with every applicable current Apple App Review requirement.

**Architecture:** Preserve Finova's account-free, local-only ledger and one-time non-consumable RevenueCat unlock. Add official purchase/refund help and make the non-banking/non-advice boundary impossible to miss in review materials.

**Tech stack:** Expo SDK 54, React Native, Expo Router, SQLite, RevenueCat, Jest, TypeScript.

---

### Task 1: Record complete applicability

**Files:**
- Create: `docs/app-store/apple-review-guideline-applicability.md`
- Modify: `docs/app-store/finova-ios-release-checklist.md`

1. Map all five guideline sections to `IMPLEMENTED`, `EXTERNAL GATE`, or `NOT APPLICABLE`.
2. Record local-only/no-account behavior, local deletion, non-consumable IAP, no financial-service activity, and public-link requirements.

### Task 2: Add Apple purchase and refund help

**Files:**
- Test: `mobile/__tests__/upgradeFlow.test.tsx`
- Modify: `mobile/src/legal/links.ts`
- Modify: `mobile/app/upgrade.tsx`
- Modify: `public/support.html`

1. Add a failing test for an official Apple purchase/refund-help link.
2. Observe RED, add the exact official URL and accessible control, and keep the purchase clearly one-time/non-renewing.
3. Update support copy for restore and refund help, then rerun focused tests.

### Task 3: Make reviewer instructions exact

**Files:**
- Modify: `docs/app-store/review-notes-draft.md`
- Modify: `docs/app-store/monetization-setup.md`
- Modify: `docs/app-store/finova-ios-release-checklist.md`

1. Document the account-free reviewer path, local-only storage, encrypted backup, deletion, exact non-consumable product, and no-bank/no-money-movement/no-advice boundary.
2. Gate App Store product setup, signed restoration, screenshots, and archive privacy evidence.

### Task 3A: Enforce HTTPS-only production transport

**Files:**
- Test: `mobile/__tests__/releaseConfig.test.ts`
- Create: `mobile/plugins/withReleaseNetworkPolicy.cjs`
- Modify: `mobile/app.json`

1. Add a failing release-policy contract test, then register a production-only Info.plist config plugin that removes Bonjour/local-network keys, disables arbitrary ATS loads, and removes localhost transport exceptions.

### Task 4: Verify

**Files:** none

1. Run focused and full mobile tests, scale tests/profile gate, typecheck, lint, Expo Doctor, production audit gate, and cache-free iOS export.
2. Stage only intended paths and commit independently.
