# Finova iOS release checklist

Status vocabulary: `PASS`, `FAIL`, `BLOCKED`, `UNVERIFIED`. A local green check is not evidence of signing, submission, Apple approval, or publication.

The automated record below predates the current Finova Plus and Terms changes. Treat it as historical evidence only; every gate must be rerun for the new candidate.

## Code-complete local gates

- [x] Native Expo Router experience with Home, Transactions, Budgets, Insights, Settings, Privacy, and Support.
- [x] Expo Go-compatible free core flows and paywall preview; StoreKit purchase and restore require a signed development/TestFlight build.
- [x] Empty-by-default local SQLite ledger with validated add, edit, search, filter, delete, and idempotent migration boundaries.
- [x] Amounts persist as positive safe-integer cents; summaries and six-month trends are deterministic.
- [x] Category budgets expose numeric on-track, near-limit, and over-limit states rather than relying on color.
- [x] Strict 1 MiB versioned JSON backup import validates fully before atomic replacement.
- [x] CSV escaping neutralizes spreadsheet-formula prefixes in user text.
- [x] Export/import artifacts use an app-owned cache namespace and cleanup paths.
- [x] Delete All requires the exact phrase `DELETE`, attempts every owned subsystem, reports partial failure, and permits retry.
- [x] Privacy/Terms/Support screens disclose local storage, explicit exports, device backups, security limits, one-time purchase terms, no bank/account/tracking/behavioral analytics, RevenueCat purchase processing, and no advice.
- [x] Four-tab phone navigation, safe-area layout, semantic controls, text error states, and 44-point primary targets.
- [x] Credential-free bundle ID/build number/EAS profiles and updates disabled.
- [x] Production EAS profile uses store distribution, the SDK-selected Xcode image, remote build-number auto-increment, and no submission credentials.
- [x] Production configuration fails closed unless a non-placeholder public RevenueCat Apple SDK key is present.
- [x] Reusable budget and export screens default to Free, and the production routes pass the verified entitlement explicitly; missing billing state cannot grant Plus.
- [x] Finova has no account, so Sign in with Apple and in-app account deletion are not applicable to this binary; `usesAppleSignIn` is explicitly false and Delete All remains available for local data.
- [x] The local-only ledger has no central application database or API bandwidth bottleneck at 25,000 monthly users; payment availability and entitlement scale remain Apple/RevenueCat provider concerns to validate externally.
- [x] Opaque 1024×1024 RGB icon with no text or transparency.
- [x] CI and manual no-deploy release-readiness workflows contain clean install, test, typecheck, lint, Expo Doctor, iOS export, a fail-closed high/critical advisory gate, prebuild stability, YAML, and redacted secret gates.

## Automated verification record

Fresh local verification on 2026-08-09:

- Mobile: 29 suites / 214 tests, TypeScript, lint, Expo Doctor 18/18, and a cache-cleared 1,311-module iOS export with a 5.24 MB Hermes bundle.
- Dependency gate: raw npm audit reports 11 high-severity transitive package entries, all rooted only in `image-size` advisories GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq through Expo/Metro. npm proposes a breaking Expo/React Native downgrade and no safe published in-range resolution exists. The checked-in gate accepts only those two advisory sources and fails closed on any new high or critical advisory.
- Release structure: both workflow YAML files parse, the tracked secret scan passes, and the icon is an opaque 1024×1024 PNG.
- Public policy status: Privacy, Terms, and Support each return HTTP 404 and remain release-blocking.
- The quarantined Create React App client is unsupported, has no deploy path, and is not a safe PWA or release surface. The legal pages require a separate safe static host; stale root `build/` output is not release evidence.

## Expo Go and physical-device gates

- [ ] `UNVERIFIED` — physical iPhone launch through Expo Go.
- [ ] `UNVERIFIED` — transaction create/edit/delete, search/filter, month switching, budgets, insights, import, share-sheet opening, cancellation, retry, and Delete All on a physical iPhone.
- [ ] `UNVERIFIED` — offline relaunch and persistence after device sleep/restart.
- [ ] `UNVERIFIED` — VoiceOver order, labels, values, hints, and destructive confirmations.
- [ ] `UNVERIFIED` — Dynamic Type at the largest accessibility sizes, Reduce Motion, dark appearance, keyboard avoidance, and compact safe areas.
- [ ] `UNVERIFIED` — iCloud, encrypted computer, and unencrypted computer backup/restore behavior, including restoration after active deletion.

## Credentialed Apple gates

- [ ] `BLOCKED` — authorized Apple Developer Program and App Store Connect access.
- [ ] `BLOCKED` — confirm Individual versus Organization enrollment; a D-U-N-S Number is relevant to Organization enrollment, not an Individual account.
- [ ] `BLOCKED` — full Xcode 26 or later selected and signed build compiled with the iOS 26 SDK or later, matching Apple's upload requirement effective 2026-04-28. See <https://developer.apple.com/news/upcoming-requirements/>.
- [ ] `BLOCKED` — EAS project initialization, iOS credentials, registered test device, and credentialed production build.
- [ ] `BLOCKED` — App Store Connect record has primary language, SKU, availability, seller/copyright, export compliance, content rights, age rating, category, Digital Services Act trader status, and App Privacy answers.
- [ ] `BLOCKED` — the exact archive privacy report and bundled third-party privacy manifests agree with Purchase History for Analytics/App Functionality, not linked, and not tracking.
- [ ] `BLOCKED` — Finova Plus non-consumable, RevenueCat entitlement/offering, localized price, Family Sharing choice, sandbox purchase/cancel/restore/reinstall behavior, and App Review purchase screenshot.
- [ ] `BLOCKED` — Privacy, Terms, and Support returned HTTP 404 during the anonymous 2026-08-09 release check; publish the safe static legal host and recheck all three over HTTPS.
- [ ] `BLOCKED` — 1–10 accepted iPhone screenshots captured from the exact TestFlight binary using `screenshot-matrix.md`.
- [ ] `BLOCKED` — TestFlight processing, installation, full device regression, and reviewer notes verified.
- [ ] `BLOCKED` — explicit submission authorization, upload, App Review, and authoritative review result.
- [ ] `BLOCKED` — public App Store listing opened anonymously and confirmed to show the released version.

No App Store acceptance or publication is claimed by this checklist.

Current environment boundary on 2026-08-09: EAS is not logged in; CocoaPods 1.17.0 is installed; only Apple Command Line Tools are selected and full Xcode is unavailable. Signed build, StoreKit sandbox, TestFlight, upload, review, and publication therefore remain external gates.
