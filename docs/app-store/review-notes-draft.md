# Finova App Review notes draft

Finova requires no account and no reviewer credentials. All core features run offline with local data.

Suggested synthetic review flow:

1. Open Finova. The ledger is empty by default.
2. Tap the add button and create an expense for `$42.15`, description `Synthetic market purchase`, date today, category Groceries.
3. Open Budgets, set Groceries to `$100.00`, and observe the numeric/text progress state.
4. Return Home and open the six-month view. A free user sees the transparent Finova Plus gate; monthly totals and the local ledger remain free.
5. Open Settings and choose View Finova plans. The screen describes a one-time unlock, shows Apple's localized price, offers Continue Free, and includes Restore Purchases, Privacy, and Terms links.
6. Password-encrypted Finova backup remains free. Enter 12–128 characters, export, and protect the password because Finova cannot recover it. CSV export is a Plus feature and is not encrypted. Both open the system share sheet only after a tap, and closing the sheet is not treated as proof of delivery.
7. Import authenticates the complete encrypted file and declared record counts before showing destructive replacement confirmation. A failure leaves active data unchanged.
8. Type the exact phrase `DELETE` and tap Delete All Data. Active finance data, preferences, and Finova-owned temporary artifacts are cleared. Delete All does not cancel/refund the non-consumable or erase Apple's purchase record; Restore Purchases rechecks the Apple account.

No bank connection, Finova account, AI, behavioral product-usage analytics, tracking, notification, recurring subscription, or advice feature is present. Finova Plus is a one-time Apple non-consumable handled by StoreKit through RevenueCat. Finova does not send ledger content, backups, or support reports to RevenueCat and does not receive payment-card details. Product configuration, signed-archive privacy reconciliation, and sandbox evidence remain BLOCKED until completed in the authorized Apple and RevenueCat accounts. Device-backup restoration remains disclosed in the app and privacy policy.

Release URL status: the candidate Privacy, Terms, and Support URLs returned HTTP 404 during an anonymous check on 2026-08-10. They must be published from the release branch and return HTTPS 200 before these notes are submitted.
