# Finova iOS release checklist

Status vocabulary: `PASS`, `FAIL`, `BLOCKED`, `UNVERIFIED`. A local green check is not evidence of signing, submission, Apple approval, or publication.

## Code-complete local gates

- [x] Native Expo Router experience with Home, Transactions, Budgets, Insights, Settings, Privacy, and Support.
- [x] Expo Go-compatible core flows; no core feature requires a custom native module.
- [x] Empty-by-default local SQLite ledger with validated add, edit, search, filter, delete, and idempotent migration boundaries.
- [x] Amounts persist as positive safe-integer cents; summaries and six-month trends are deterministic.
- [x] Category budgets expose numeric on-track, near-limit, and over-limit states rather than relying on color.
- [x] Strict 1 MiB versioned JSON backup import validates fully before atomic replacement.
- [x] CSV escaping neutralizes spreadsheet-formula prefixes in user text.
- [x] Export/import artifacts use an app-owned cache namespace and cleanup paths.
- [x] Delete All requires the exact phrase `DELETE`, attempts every owned subsystem, reports partial failure, and permits retry.
- [x] Privacy/support screens disclose local storage, explicit exports, device backups, security limits, no bank/account/tracking/analytics, and no advice.
- [x] Four-tab phone navigation, safe-area layout, semantic controls, text error states, and 44-point primary targets.
- [x] Credential-free bundle ID/build number/EAS profiles and updates disabled.
- [x] Opaque 1024×1024 RGB icon with no text or transparency.
- [x] CI and manual no-deploy release-readiness workflows contain clean install, test, typecheck, lint, Expo Doctor, iOS export, audit, prebuild-stability, YAML, and redacted secret gates.

## Automated verification record

Exact final clean-clone evidence is recorded only after Task 7. Working-tree checks do not fill this section.

## Expo Go and physical-device gates

- [ ] `UNVERIFIED` — physical iPhone launch through Expo Go.
- [ ] `UNVERIFIED` — transaction create/edit/delete, search/filter, month switching, budgets, insights, import, share-sheet opening, cancellation, retry, and Delete All on a physical iPhone.
- [ ] `UNVERIFIED` — offline relaunch and persistence after device sleep/restart.
- [ ] `UNVERIFIED` — VoiceOver order, labels, values, hints, and destructive confirmations.
- [ ] `UNVERIFIED` — Dynamic Type at the largest accessibility sizes, Reduce Motion, dark appearance, keyboard avoidance, and compact safe areas.
- [ ] `UNVERIFIED` — iCloud, encrypted computer, and unencrypted computer backup/restore behavior, including restoration after active deletion.

## Credentialed Apple gates

- [ ] `BLOCKED` — authorized Apple Developer Program and App Store Connect access.
- [ ] `BLOCKED` — full Xcode 26 or later selected and signed build compiled with the iOS 26 SDK or later, matching Apple's upload requirement effective 2026-04-28. See <https://developer.apple.com/news/upcoming-requirements/>.
- [ ] `BLOCKED` — EAS project initialization, iOS credentials, registered test device, and credentialed production build.
- [ ] `BLOCKED` — App Store Connect record, seller/copyright, export compliance, content rights, age rating, category, and App Privacy answers.
- [ ] `BLOCKED` — privacy and support URLs published from this release and anonymously verified over HTTPS.
- [ ] `BLOCKED` — 1–10 accepted iPhone screenshots captured from the exact TestFlight binary using `screenshot-matrix.md`.
- [ ] `BLOCKED` — TestFlight processing, installation, full device regression, and reviewer notes verified.
- [ ] `BLOCKED` — explicit submission authorization, upload, App Review, and authoritative review result.
- [ ] `BLOCKED` — public App Store listing opened anonymously and confirmed to show the released version.

No App Store acceptance or publication is claimed by this checklist.
