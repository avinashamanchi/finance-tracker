# Finova App Privacy draft

Status: draft for the authorized App Store Connect account holder. It is not an App Store Connect submission.

## Data collection answers

Finova's ledger and planning data are local-only: transactions, budgets, recurring bills, and savings goals remain in the app's SQLite database. There is no Finova account, server API, bank connection, advertising, tracking, behavioral product-usage analytics, crash-reporting SDK, or cross-app advertising identifier.

The shipping candidate includes RevenueCat for the optional one-time Finova Plus purchase. Finova does not send the ledger, amounts, descriptions, categories, backups, or support report to RevenueCat. Apple and RevenueCat process an anonymous app-user identifier, product and purchase/entitlement information, and technical request metadata to offer and restore the purchase. The App Store Connect draft answer is **Yes, data is collected** and provisionally discloses **Purchase History** for **Analytics** and **App Functionality**. Finova passes no custom user ID, account identity, advertising ID, or RevenueCat customer attributes. Reconcile linked-to-user, User ID, Device ID, diagnostics, and any other data-type answers against the exact signed archive privacy report and RevenueCat's then-current provider disclosure before submission; do not rely on this draft alone.

The user can explicitly export a password-encrypted Finova backup or unencrypted CSV ledger through the iOS share sheet. The destination selected by the user receives the file under that destination's own terms. Encrypted import authenticates and validates a copied file before atomic replacement. These user-directed transfers are not automatic collection by Finova.

## Permissions

The candidate requests no contacts, photos, camera, microphone, location, health, banking, Bluetooth, local-network, advertising, or tracking permission. The system document picker and share sheet appear only after a user action.

## Retention and deletion

Active finance data remains until the user edits, deletes, imports a replacement, removes the app, or uses Delete All. Temporary Finova export artifacts are removed after the share sheet closes. Delete All retries app-owned database, artifact, and preference boundaries and reports partial failure. Finova has no account to delete. Delete All does not cancel or refund the non-consumable, erase Apple's purchase record, or erase RevenueCat's entitlement record. Restore Purchases rechecks the current Apple account.

iPhone or iPad backups may include local app data. An existing iCloud or Mac/PC backup may restore data previously deleted from the active installation. Finova cannot inspect or delete those backups.

## Security and limits

Local-only storage and encrypted backup do not guarantee confidentiality. Device access, screenshots, shared CSV files, malware, weak or reused backup passwords, and computer backups can expose finance entries. Finova is a record-keeping tool, not financial, tax, legal, credit, or investment advice.
