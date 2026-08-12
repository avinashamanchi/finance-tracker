# Finova landing and live-demo design

**Date:** 2026-08-11
**Status:** Design approved; pending written-spec review

## Product frame

- **Subject:** A local-first iPhone ledger for records, budgets, recurring items, and user-directed backups.
- **Audience:** People who want manual financial clarity without linking a bank account or creating an account.
- **Single page job:** Make the local ledger tangible, explain its limits, and let visitors explore without implying that the App Store release is already available.

## Scope

This redesign replaces the sparse public static landing page. It does not restore the quarantined legacy web app, connect a bank, process finance data, add advice, or change the mobile application.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Porcelain | `#F2F6F2` | Primary canvas |
| Ledger ink | `#13271F` | Headlines and dark surfaces |
| Money green | `#267A5C` | Positive state and primary action |
| Ledger coral | `#D66B50` | Expense and caution state |
| Grid | `#CAD8D0` | Rules and data structure |

- **Display:** Sora, with a geometric system fallback.
- **Body:** DM Sans, with a system sans-serif fallback.
- **Utility:** IBM Plex Mono, with a system monospace fallback.
- **Layout:** A calm modern ledger: generous porcelain space, exact columns, and data rows that become a monthly summary.
- **Signature:** A transaction enters a receipt-like ledger tape, receives a category, and visibly changes the budget balance.

## Page structure

1. Sticky navigation: Finova wordmark, Demo, How it works, Privacy, Support, and Explore demo.
2. First viewport: clear local-first statement, no-bank-login qualifier, release-preparation status, and live ledger simulation.
3. Trust strip: no account, no bank connection, user-directed exports.
4. Three-step manual record-to-summary explanation.
5. Focused capabilities: transactions, budgets, recurring items, deterministic summaries, and encrypted user-directed backup.
6. Financial-tool limitations and public policy links.
7. Release-status action and legal/support footer.

There is no Download button until a real store URL exists. The page must not offer financial, tax, credit, or investment advice.

## Live-demo behavior

The simulation uses fixed fictional amounts and remains entirely inside the static page.

The state machine is:

`empty ledger -> transaction entered -> category applied -> monthly budget updated`

- Autoplay begins in view, stops out of view, and exposes Pause, Replay, and stage controls.
- Currency amounts remain exact fixed strings; the demo does not calculate from user input.
- Reduced-motion users receive the completed ledger and budget state immediately.
- If scripting fails, a readable completed ledger remains in the HTML.
- The simulation never reads storage, contacts a service, accepts finance data, or represents bank synchronization.

## Navigation and responsive behavior

- Anchors account for the sticky header.
- The mobile menu exposes the same destinations and correct expanded state.
- Ledger rows retain labels and amounts at 320 CSS pixels without horizontal scrolling.
- Stage controls wrap and remain at least 44 CSS pixels high.
- Release status remains adjacent to the action so it cannot be mistaken for a live download.

## Implementation boundary

The public site remains a standalone static bundle in `public/`. Semantic HTML provides the complete fallback; one scoped stylesheet and one deferred script enhance navigation and demo motion. The quarantined `legacy-web/` tree remains untouched and unreferenced.

## Verification

Automated checks cover:

- stage order, pause, replay, direct selection, viewport suspension, and reduced motion;
- zero fetch, persistent storage, form, or finance-data inputs;
- legal/support links and accurate release-status language;
- the quarantine boundary remaining enforced;
- semantic navigation and mobile-menu state.

Visual checks cover desktop, tablet, 390-pixel iPhone, and 320-pixel narrow layouts, keyboard focus, and reduced motion.

## Acceptance criteria

- Visitors understand the record-to-budget workflow in the first viewport.
- The page never implies bank connectivity, advice, or a published App Store build.
- Privacy, terms, and support remain one interaction away.
- Static publication, security scans, mobile CI, and quarantine tests remain green.
