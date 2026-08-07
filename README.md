# Finova — iOS-first personal finance tracker

Finova's supported product surface is the local-first Expo/React Native app in
`mobile/`. It starts with an empty ledger and uses integer-cent arithmetic for
transaction CRUD, search and filters, monthly category budgets, six-month
insights, strict JSON backup import, CSV export, and coordinated local deletion.

## Supported development

Use Node 22 and work only from `mobile/`:

```bash
cd mobile
npm ci
npm start
```

Scan the QR code in Expo Go while the phone and Mac are on the same network.
Expo Go observation is a device checkpoint, not proof of a signed TestFlight or
App Store build.

Run the local release gates from `mobile/`:

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run expo:doctor
npm run export:ios
npm audit --audit-level=high
npx expo prebuild --platform ios --no-install --clean
git diff --exit-code -- package.json package-lock.json
```

App Store drafts and explicit external blockers are in `docs/app-store/`. No
signing, submission, approval, or publication is claimed by this repository.

## Unsafe local archaeology

The old Create React App demo is quarantined in `legacy-web/`. It is
unsupported, has no deploy path, is not a migration source, stores plaintext
passwords in browser `localStorage`, and must never receive real credentials or
real finance data. Its repository scripts require an exact unsafe opt-in; see
`legacy-web/QUARANTINED.md`. That guard protects repository scripts, not an
arbitrary manual `react-scripts` invocation.

This local commit does not disable or update the already-published GitHub Pages
branch, does not clear any browser `localStorage`, and must not be represented
as fixing the live site. Never migrate `finova_users` or `finova_session`. If
historical finance entries matter, recovery must be a separate user-directed
workflow before an authorized shutdown.

Before release, replace the Pages root with a safe static landing/legal host or
disable it and verify the result anonymously. Do not publish only the retained
legal pages onto the unsafe existing branch, because their return links lead to
its root. The repository-root `public/privacy.html`, `public/terms.html`, and
`public/support.html` remain static legal artifacts.
