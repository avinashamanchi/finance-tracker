# Finova — Apple App Review guideline applicability

Reviewed against Apple's App Review overview and App Review Guidelines on 2026-08-10. `IMPLEMENTED` is repository evidence, `EXTERNAL GATE` requires direct release evidence, and `N/A` requires the capability to remain absent.

| Guideline | Status | Finova decision and evidence |
| --- | --- | --- |
| 1.1 Objectionable content | IMPLEMENTED | Private financial records only; no supplied objectionable content or public publishing. |
| 1.2 User-generated content | N/A | No accounts, community, feed, chat, posting, following, or discovery. |
| 1.3 Kids Category | N/A | General finance/productivity utility, not child-directed and not Kids Category. |
| 1.4 Physical harm | IMPLEMENTED | Explicitly a record/visualization tool: no bank connection, money movement, blocked purchases, forecasts, or financial/tax/legal/credit/investment advice. |
| 1.5 Developer information | EXTERNAL GATE | Accurate seller, review, support, and legal-entity information must be entered in App Store Connect. |
| 1.6 Data security | IMPLEMENTED + EXTERNAL GATE | Local SQLite, exact minor units, bounded paging, password-encrypted backup, deletion, and tests exist. Signed archive/backup behavior and RevenueCat configuration remain external. |
| 1.7 Reporting criminal activity | N/A | No crime-reporting feature. |
| 2.1 App completeness | EXTERNAL GATE | Do not submit until public links, one-time IAP, signed restore, migration, backup/import/export, large-ledger, and all device flows work without placeholders. |
| 2.2 Beta testing | EXTERNAL GATE | Use TestFlight for unfinished builds and avoid beta/demo/test wording in production metadata. |
| 2.3 Accurate metadata | IMPLEMENTED + EXTERNAL GATE | Metadata accurately states local-only storage, no bank connection, one-time Plus, and limits. Final screenshots/forms must match the signed build. |
| 2.4 Hardware compatibility | IMPLEMENTED + EXTERNAL GATE | iPhone-only portrait v1, responsive bounded ledger queries, 48-point controls, local operation. Verify signed-device accessibility, memory, migrations, and disable untested Mac/Vision availability. |
| 2.5 Software requirements | IMPLEMENTED + EXTERNAL GATE | Public APIs, HTTPS only for App Store entitlement service, sandbox, Files picker, no downloaded code/background mode. Archive privacy-manifest and IPv6-only verification remain. |
| 3.1.1 In-App Purchase | IMPLEMENTED + EXTERNAL GATE | Finova Plus is one non-consumable Apple IAP via RevenueCat. StoreKit-localized full one-time price, purchase, restore, privacy, and terms are coded; product/sandbox verification is external. |
| 3.1.2 Subscriptions | N/A | Finova Plus does not renew and must never be described or configured as a subscription. |
| 3.1.3 Other purchase methods | IMPLEMENTED | No external checkout or steering for digital features. |
| 3.1.5 Cryptocurrency and 3.2 financial services | N/A | No crypto, trading, lending, banking, money transmission, fundraising, or real-money financial service. Finova records user-entered numbers only, so it must not be marketed as a bank or advisor. |
| 4.1 Copycats | IMPLEMENTED | Original name/assets/workflow; final asset rights require verification. |
| 4.2 Minimum functionality | IMPLEMENTED | Native local ledger, dashboards, budgets, expected bills, goals, encrypted backups, CSV export, migration and search—not a website wrapper. |
| 4.3 Spam | IMPLEMENTED | Distinct local-finance purpose; no reused icon/screenshots/metadata/binary. |
| 4.4–4.7 Extensions/Apple services/alternate icons/mini apps | N/A | None present. |
| 4.8 Login services | N/A | No login or account creation. Adding one triggers account deletion and login-service review. |
| 4.9 Apple Pay | N/A | Finova never moves money and has no Apple Pay flow. |
| 4.10 Built-in capabilities | IMPLEMENTED | Plus unlocks finance workflow features, not a charge for Files or another built-in iOS capability itself. |
| 5.1 Privacy | IMPLEMENTED + EXTERNAL GATE | In-app/static policy covers local ledger, backups/exports, Apple/RevenueCat, no tracking, retention, and deletion. Public pages and App Privacy answers must match the archive. |
| 5.1.1 Collection/minimization | IMPLEMENTED | Ledger data stays local; no account, ads, tracking, contacts, bank credentials, financial account connection, or card details. RevenueCat receives only purchase/entitlement identifiers needed for IAP. |
| 5.1.1(v) Account deletion | N/A | No Finova account. Delete All/local reset is provided; account creation cannot ship without in-app deletion. |
| 5.1.2 Data use/sharing | IMPLEMENTED + EXTERNAL GATE | No ledger data is sent to RevenueCat. Verify final SDK manifest and App Privacy disclosure for purchase history/identifier handling. |
| 5.2 Intellectual property | IMPLEMENTED + EXTERNAL GATE | Users own entered/exported content; verify every bundled/screenshot asset and seller copyright. |
| 5.3–5.5 Gambling/VPN/device management | N/A | None present. |
| 5.6 Developer conduct | EXTERNAL GATE | Honest no-bank/no-advice claims, functional support, accurate privacy answers, and no review manipulation are required. |

## Submission-stopping external gates

- Privacy, Terms, and Support URLs return HTTPS 200 with the released text.
- The exact non-consumable product is approved/configured in Apple and RevenueCat and passes purchase, cancellation, interruption, already-owned, refund/revocation, reinstall, and restore on the signed candidate.
- The exact archive passes migration, large-ledger, encrypted backup round trip/corruption/wrong-password, CSV, Delete All, accessibility, privacy-manifest, crash, and IPv6-only validation.
- Screenshots use synthetic financial data, come from the submitted build, and match the chosen iPhone device sizes.
- Paid Apps Agreement, tax/banking, age rating, App Privacy, content rights, category, DSA status, availability, export compliance, and IAP review metadata are complete.

Subscriptions, trials, offer codes, win-back offers, Family Sharing, promoted IAP, external digital payments, and custom product pages remain disabled for v1.
