# Finova App Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Finova's repository-controlled iOS release packet and harden the one-time Plus purchase build contract.

**Architecture:** Preserve the no-account, local-only ledger and deterministic insights. Use RevenueCat only to bridge Apple's non-consumable StoreKit entitlement; keep free transactions, monthly summaries, JSON backup/import, and up to three active budgets available without purchase.

**Tech Stack:** Expo SDK 54, React Native 0.81, SQLite, RevenueCat, EAS Build, Jest.

## Global Constraints

- Finova does not connect banks, provide advice, track users, or run analytics.
- Plus is a one-time non-consumable, never a recurring subscription.
- Price comes from StoreKit; Continue Free and Restore Purchases remain visible.
- Production upload must use Xcode 26 and iOS 26 SDK or later.
- Screenshots use synthetic financial data from the signed candidate only.

---

### Task 1: Harden versioning and release configuration

**Files:**
- Modify: `mobile/__tests__/releaseConfig.test.ts`
- Modify: `mobile/eas.json`

- [ ] **Step 1: Change the test to require remote auto-increment**

Assert `cli.appVersionSource === "remote"`, clean-commit enforcement, store distribution, production `autoIncrement === true`, iOS image `auto`, and no embedded submission credentials.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --runInBand __tests__/releaseConfig.test.ts`
Expected: FAIL because the current production profile uses local static build number 1.

- [ ] **Step 3: Implement the EAS release contract**

Switch to remote versioning and production auto-increment while retaining disabled OTA updates and credential-free source.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- --runInBand __tests__/releaseConfig.test.ts`
Expected: PASS.

### Task 2: Reconcile legal and submission state

**Files:**
- Modify: `docs/app-store/finova-ios-release-checklist.md`
- Modify: `docs/app-store/metadata-draft.json`
- Modify: `docs/app-store/review-notes-draft.md`

- [ ] **Step 1: Record public URL failures**

Document that Privacy, Terms, and Support returned HTTP 404 on 2026-08-07 and block submission until GitHub Pages publishes the exact candidate pages.

- [ ] **Step 2: Preserve the purchase gate**

Keep App Store Connect product creation, RevenueCat entitlement mapping, localized price loading, purchase/cancel/restore, and TestFlight verification unchecked.

- [ ] **Step 3: Preserve device and screenshot gates**

Keep VoiceOver, Dynamic Type, backup/restore, 6.9-inch screenshots, App Review, and public listing verification unchecked.

### Task 3: Verify the repository-controlled candidate

- [ ] **Step 1: Run the mobile release suite**

Run: `npm test -- --runInBand && npm run typecheck && npm run lint && npx expo-doctor && npm run export:ios`.

- [ ] **Step 2: Run web and security gates**

Run the existing web build, production dependency audit, workflow parser, and redacted secret scan.

- [ ] **Step 3: Stop before external mutation**

Do not publish Pages, create the Apple product, alter RevenueCat, upload, or submit without the authorized accounts and explicit credentialed release step.
