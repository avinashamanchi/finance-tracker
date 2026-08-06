# Finova App Privacy draft

Status: draft for the authorized App Store Connect account holder. It is not an App Store Connect submission.

## Data collection answers

Finova is designed to collect no data from the app developer's perspective. Transactions and budgets remain in the app's local SQLite database. There is no account, server API, bank connection, advertising, tracking, analytics, crash-reporting SDK, or cross-app identifier.

The user can explicitly export a JSON backup or CSV ledger through the iOS share sheet. The destination selected by the user receives the file under that destination's own terms. The user can explicitly import a copied JSON backup. These user-directed transfers are not automatic collection by Finova.

## Permissions

The candidate requests no contacts, photos, camera, microphone, location, health, banking, Bluetooth, local-network, advertising, or tracking permission. The system document picker and share sheet appear only after a user action.

## Retention and deletion

Active finance data remains until the user edits, deletes, imports a replacement, removes the app, or uses Delete All. Temporary Finova export artifacts are removed after the share sheet closes. Delete All retries app-owned database, artifact, and preference boundaries and reports partial failure.

iPhone or iPad backups may include local app data. An existing iCloud or Mac/PC backup may restore data previously deleted from the active installation. Finova cannot inspect or delete those backups.

## Security and limits

Local-only storage does not guarantee confidentiality. Device access, screenshots, shared files, malware, and unencrypted computer backups can expose finance entries. Finova is a record-keeping tool, not financial, tax, legal, credit, or investment advice.
