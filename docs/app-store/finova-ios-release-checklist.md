# Finova iOS release checklist

Status vocabulary: `PASS`, `FAIL`, `BLOCKED`, `UNVERIFIED`. A local green check is not evidence of signing, submission, Apple approval, or publication.

The automated record below covers the current local candidate. It is local evidence only and does not replace signed-device, provider, App Store Connect, or Apple review evidence.

## Code-complete local gates

- [x] Native Expo Router experience with Home, Transactions, Budgets, Expected Bills, Savings Goals, Insights, Settings, Privacy, Terms, and Support.
- [x] Expo Go-compatible free core flows and paywall preview; StoreKit purchase and restore require a signed development/TestFlight build.
- [x] Empty-by-default local SQLite ledger with validated add, edit, search, filter, delete, and idempotent migration boundaries.
- [x] Amounts persist as positive safe-integer cents; summaries and six-month trends are deterministic.
- [x] Category budgets expose numeric on-track, near-limit, and over-limit states rather than relying on color.
- [x] Password-encrypted, authenticated, framed backup export/import streams in bounded pages, validates counts/ownership/foreign keys in staging, and replaces active data atomically only after confirmation.
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
- [x] Deterministic Node SQLite gates exercise an exact 100,000-row current schema and frozen shipped-v1→v4 migration with 50-row keyset paging, FTS, SQL aggregates, index plans, content digest, reopen/no-op migration, and no-full-reload UI rules. Node evidence does not satisfy the physical-iPhone gate.
- [x] Opaque 1024×1024 RGB icon with no text or transparency.
- [x] CI and manual no-deploy release-readiness workflows contain clean install, test, typecheck, lint, Expo Doctor, iOS export, a fail-closed high/critical advisory gate, prebuild stability, YAML, and redacted secret gates.
- [x] The one-time paywall exposes Restore Purchases, Privacy, Terms, and official Apple purchase/refund help while continuing to state that Plus does not renew.
- [x] `apple-review-guideline-applicability.md` records all Apple guideline families, app-specific evidence, external gates, and absent capabilities that cannot be added without re-review.
- [x] A production-only Expo config plugin strips unused Bonjour/local-network declarations, disables arbitrary ATS loads, and removes localhost transport exceptions from the generated release Info.plist; a sanitized production prebuild was inspected and contained none of those development declarations.

## Automated verification record

Fresh local verification on 2026-08-11:

- Mobile: 44 suites / 250 tests, plus 3 focused scale suites / 4 tests; TypeScript, lint, Expo Doctor 18/18, and a cache-cleared 1,349-module iOS export with a 5.54 MB Hermes bundle.
- Dependency gate: raw npm audit reports 11 high-severity transitive package entries, all rooted only in `image-size` advisories GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq through Expo/Metro. npm proposes a breaking Expo/React Native downgrade and no safe published in-range resolution exists. The checked-in gate accepts only those two advisory sources and fails closed on any new high or critical advisory.
- Hosted security: GitHub Dependabot alerts and automated security fixes are enabled. CodeQL default setup uses the extended query suite for Actions and JavaScript/TypeScript, the current PR scan passed, and all workflow actions are pinned to immutable commit SHAs.
- Scale profile: the deterministic 100,000-transaction Node SQLite fixture completed in 854.579 ms; p95 first-page, FTS search, and aggregate timings were 0.048 ms, 8.043 ms, and 1.004 ms. This is content-free regression evidence, not a physical-device result or a live concurrent-user claim.
- Release structure: all three workflow YAML files parse, the tracked-plus-export secret scan passes across 253 files, and the icon is an opaque 1024×1024 PNG.
- Public policy status: anonymous checks on 2026-08-11 returned HTTPS 200 for Privacy, Terms, and Support, and each response matched its tracked `public/` file byte for byte.
- The quarantined Create React App source is unsupported archaeology. Its package and lock contain no dependencies or runnable scripts and audit at zero vulnerabilities; it has no deploy path. GitHub Pages now serves only the reviewed static legal/support surface, and stale root `build/` output is not release evidence.

## Expo Go and physical-device gates

- [ ] `UNVERIFIED` — physical iPhone launch through Expo Go.
- [ ] `UNVERIFIED` — transaction create/edit/delete, search/filter, month switching, budgets, insights, import, share-sheet opening, cancellation, retry, and Delete All on a physical iPhone.
- [ ] `UNVERIFIED` — offline relaunch and persistence after device sleep/restart.
- [ ] `UNVERIFIED` — VoiceOver order, labels, values, hints, and destructive confirmations.
- [ ] `UNVERIFIED` — Dynamic Type at the largest accessibility sizes, Reduce Motion, dark appearance, keyboard avoidance, and compact safe areas.
- [ ] `UNVERIFIED` — iCloud, encrypted computer, and unencrypted computer backup/restore behavior, including restoration after active deletion.
- [ ] `UNVERIFIED` — all raw measurements and integrity rows in `finova-25k-device-evidence.md` on the exact signed release candidate.

## Credentialed Apple gates

- [ ] `BLOCKED` — authorized Apple Developer Program and App Store Connect access.
- [ ] `BLOCKED` — confirm Individual versus Organization enrollment; a D-U-N-S Number is relevant to Organization enrollment, not an Individual account.
- [ ] `BLOCKED` — full Xcode 26 or later selected and signed build compiled with the iOS 26 SDK or later, matching Apple's upload requirement effective 2026-04-28. See <https://developer.apple.com/news/upcoming-requirements/>.
- [ ] `BLOCKED` — EAS project initialization, iOS credentials, registered test device, and credentialed production build.
- [ ] `BLOCKED` — App Store Connect record has primary language, SKU, availability, seller/copyright, export compliance, content rights, age rating, category, Digital Services Act trader status, and App Privacy answers.
- [ ] `BLOCKED` — the exact archive privacy report and bundled third-party privacy manifests agree with Purchase History for Analytics/App Functionality, not linked, and not tracking.
- [ ] `BLOCKED` — Apple's updated age-rating questionnaire is completed for the exact submitted version.
- [ ] `BLOCKED` — Accessibility Nutrition Label answers are based on the signed-device VoiceOver, Voice Control, Larger Text, contrast, and Reduce Motion results above; no unverified support is claimed.
- [ ] `BLOCKED` — product page name, icon, subtitle, description, promotional text, keywords, and 1–10 screenshots are complete, accurate, localized where offered, and contain no placeholder or private finance data.
- [ ] `BLOCKED` — required device capabilities and every generated Info.plist usage description match the exact archive and are exercised on a current iOS 26 device.
- [ ] `BLOCKED` — Mac with Apple silicon and Apple Vision Pro availability are explicitly disabled for v1 unless the exact signed iPhone build and local-data behavior are separately tested and supported there.
- [ ] `BLOCKED` — Finova Plus non-consumable, RevenueCat entitlement/offering, localized price, Family Sharing choice, sandbox purchase/cancel/restore/reinstall behavior, and App Review purchase screenshot.
- [ ] `BLOCKED` — Family Sharing, subscriptions, trials, offer codes, win-back offers, promoted IAP, and external digital payments remain disabled for v1.
- [x] Privacy, Terms, and Support returned HTTPS 200 anonymously on 2026-08-11 and matched the tracked release files byte for byte; recheck immediately before submission.
- [ ] `BLOCKED` — 1–10 accepted iPhone screenshots captured from the exact TestFlight binary using `screenshot-matrix.md`.
- [ ] `BLOCKED` — TestFlight processing, installation, full device regression, and reviewer notes verified.
- [ ] `BLOCKED` — reviewer notes state that no credentials are required and give the exact synthetic local-ledger, encrypted-backup, one-time purchase, restore, and Delete All path.
- [ ] `BLOCKED` — explicit submission authorization, upload, App Review, and authoritative review result.
- [ ] `BLOCKED` — public App Store listing opened anonymously and confirmed to show the released version.

No App Store acceptance or publication is claimed by this checklist.

Current environment boundary on 2026-08-11: EAS is not logged in; CocoaPods 1.17.0 is installed; only Apple Command Line Tools are selected and full Xcode is unavailable. Signed build, StoreKit sandbox, TestFlight, upload, review, and publication therefore remain external gates.
