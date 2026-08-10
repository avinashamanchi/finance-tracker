# Finova App Privacy draft

Status: draft for the authorized App Store Connect account holder. It is not an App Store Connect submission.

## Data collection answers

Finova's ledger is local-only: transactions and budgets remain in the app's SQLite database. There is no Finova account, server API, bank connection, advertising, tracking, behavioral product-usage analytics, crash-reporting SDK, or cross-app advertising identifier.

The shipping candidate includes RevenueCat for the optional one-time Finova Plus purchase. The App Store Connect draft answer is **Yes, data is collected** and discloses **Purchase History** for **Analytics** and **App Functionality**. Finova passes no custom user ID, account identity, advertising ID, or RevenueCat customer attributes, so RevenueCat generates an anonymous App User ID; under RevenueCat's current Apple App Privacy guidance, mark Purchase History **not linked to identity** and **not used for tracking**, and do not separately select User ID or Device ID. Apple processes payment. Finova does not receive full payment-card details. Reconcile this draft against the exact signed archive privacy report and RevenueCat's current provider disclosures before submission.

The user can explicitly export a JSON backup or CSV ledger through the iOS share sheet. The destination selected by the user receives the file under that destination's own terms. The user can explicitly import a copied JSON backup. These user-directed transfers are not automatic collection by Finova.

## Permissions

The candidate requests no contacts, photos, camera, microphone, location, health, banking, Bluetooth, local-network, advertising, or tracking permission. The system document picker and share sheet appear only after a user action.

## Retention and deletion

Active finance data remains until the user edits, deletes, imports a replacement, removes the app, or uses Delete All. Temporary Finova export artifacts are removed after the share sheet closes. Delete All retries app-owned database, artifact, and preference boundaries and reports partial failure. Finova has no account to delete. Removing local data or the app does not revoke the Apple purchase record or RevenueCat entitlement; Restore Purchases can recover the unlock for the same Apple account.

iPhone or iPad backups may include local app data. An existing iCloud or Mac/PC backup may restore data previously deleted from the active installation. Finova cannot inspect or delete those backups.

## Security and limits

Local-only storage does not guarantee confidentiality. Device access, screenshots, shared files, malware, and unencrypted computer backups can expose finance entries. Finova is a record-keeping tool, not financial, tax, legal, credit, or investment advice.
