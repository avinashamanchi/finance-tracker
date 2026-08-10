# Finova Plus — Apple purchase setup

Status: `CODED / EXTERNAL CONFIGURATION BLOCKED`. The app has a real RevenueCat non-consumable purchase, entitlement, cancellation, and restore boundary. Expo Go intentionally shows a preview and cannot complete StoreKit purchases.

## Product contract

| Item | Exact value |
| --- | --- |
| RevenueCat entitlement | `finova_plus` |
| Non-consumable product | `com.avinashamanchi.finova.plus.lifetime` |
| Suggested launch price | US $9.99 one time; confirm every storefront in App Store Connect |
| Plus access | Unlimited active budgets, optional rollover, six-month insights, CSV export, expected-bill planning with confirm-before-record, and savings goals |
| Free plan | Unlimited transactions, up to 3 active budgets, monthly summaries, and encrypted backup/import |

Finova uses a one-time unlock because its core ledger and calculations are local. The UI never hard-codes the selling price; it displays Apple's localized StoreKit price returned through RevenueCat.

## App Store Connect and RevenueCat gate

1. Accept the latest Paid Apps Agreement and complete banking/tax setup in the authorized account.
2. Create a non-consumable in-app purchase with the exact product identifier above, then add localization, price, review screenshot, and review notes.
3. In RevenueCat, connect the Apple app, import the product, attach it to the `finova_plus` entitlement, and add a lifetime package to the current offering.
4. Set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` to the RevenueCat **public Apple SDK key** in the EAS development/preview/production environments. Do not place an App Store Connect private key or RevenueCat secret API key in the app.
5. In App Store Connect App Privacy, reconcile Purchase History, anonymous app-user identifier, technical request metadata, linkage, and purpose answers against the exact signed archive privacy report and RevenueCat's current guidance. Finova sends no custom RevenueCat attributes or ledger content; do not infer that this automatically resolves every App Privacy field.
6. Build a signed iOS development build. Verify localized price loading, successful purchase, cancellation, interrupted network, already-owned state, Restore Purchases after reinstall, and unchanged free-ledger data using Apple sandbox accounts. RevenueCat documents a sandbox-specific anonymous-ID reinstall caveat, so exercise that exact path rather than inferring it from unit tests.
7. Confirm the non-consumable's Family Sharing choice, tax category, availability, localization, and review screenshot in App Store Connect.
8. Repeat the complete flow in the exact TestFlight candidate and provide the purchase screenshot and reviewer path in App Review notes.

At 25,000 MAU, Apple and RevenueCat—not an app-owned Finova server—serve purchases and entitlement refreshes. The repository-controlled gate proves fail-closed entitlement states and listener cleanup, but provider dashboard configuration, sandbox availability, rate behavior, and outage recovery remain external evidence.

Do not submit while the paywall says configuration is unavailable, the product does not load, Restore Purchases is unverified, or the Apple and RevenueCat product identifiers differ.
