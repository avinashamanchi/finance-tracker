# Finova App Review notes draft

Finova requires no account and no reviewer credentials. All core features run offline with local data.

Suggested synthetic review flow:

1. Open Finova. The ledger is empty by default.
2. Tap the add button and create an expense for `$42.15`, description `Synthetic market purchase`, date today, category Groceries.
3. Open Budgets, set Groceries to `$100.00`, and observe the numeric/text progress state.
4. Return Home and open the six-month view. A free user sees the transparent Finova Plus gate; monthly totals and the local ledger remain free.
5. Open Settings and choose View Finova plans. The screen describes a one-time unlock, shows Apple's localized price, offers Continue Free, and includes Restore Purchases, Privacy, and Terms links.
6. JSON backup remains free. CSV export is a Plus feature; both open the system share sheet only after a tap, and closing the sheet is not treated as proof of delivery.
7. Import validates a versioned JSON file before showing a destructive replacement confirmation.
8. Type the exact phrase `DELETE` and tap Delete All Data. The active ledger, budgets, and Finova-owned temporary artifacts are cleared. Purchase entitlement remains associated with the Apple account and can be restored.

No bank connection, Finova account, AI, behavioral product-usage analytics, tracking, notification, recurring subscription, or advice feature is present. Finova Plus is a one-time Apple non-consumable handled by StoreKit through RevenueCat; RevenueCat uses Purchase History for purchase analytics and App Functionality, and Finova does not receive payment-card details. Product configuration and sandbox evidence remain BLOCKED until completed in the authorized Apple and RevenueCat accounts. Device-backup restoration remains disclosed in the app and privacy policy.

Release URL status: the candidate Privacy, Terms, and Support URLs returned HTTP 404 during an anonymous check on 2026-08-09. They must be published from the release branch and return HTTPS 200 before these notes are submitted.
