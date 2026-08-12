# Finova Landing Live Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Finova's sparse static page with a navigable first-viewport ledger-to-budget simulation and truthful release status.

**Architecture:** Keep the public site fully static and progressively enhanced. Semantic HTML contains the completed fallback, a scoped stylesheet owns the visual system, and a standalone script owns deterministic demo/navigation state without reading financial data or touching the quarantined legacy app.

**Tech Stack:** Semantic HTML, modern CSS, dependency-free JavaScript, Node test runner, GitHub Pages

## Global Constraints

- Demo stages are exactly `empty`, `entered`, `categorized`, and `budget`.
- The public page cannot accept finance data, read storage, fetch, or connect a bank.
- Keep exact fictional currency strings and label the release as in preparation.
- Do not modify or reference `legacy-web/`.
- Reduced motion and no-script states show the completed ledger.

---

### Task 1: Static demo controller and publication contract

**Files:**
- Create: `public/demo.js`
- Create: `scripts/test-public-landing.mjs`

**Interfaces:**
- Produces: `globalThis.FinovaDemo.STAGES`, `nextStage(stage)`, and `createController(options)`.

- [ ] **Step 1: Write the failing Node contract**

Load `public/demo.js` in `node:vm`; assert exact stages, wraparound, pause, replay, select, reduced-motion completion, disposal, and no `fetch`/storage/form access.

- [ ] **Step 2: Run the contract and verify RED**

Run: `node scripts/test-public-landing.mjs`
Expected: FAIL because `public/demo.js` does not exist.

- [ ] **Step 3: Implement the injected-timer controller**

The controller accepts `onStage`, `setTimer`, `clearTimer`, and `reducedMotion`; it exposes `play`, `pause`, `replay`, `select`, and `dispose`.

- [ ] **Step 4: Run the contract and verify GREEN**

Run: `node scripts/test-public-landing.mjs`
Expected: PASS.

### Task 2: Ledger-first landing composition

**Files:**
- Modify: `public/index.html`
- Create: `public/styles.css`
- Modify: `public/demo.js`
- Modify: `scripts/test-public-landing.mjs`

**Interfaces:**
- Consumes: `FinovaDemo.createController()`.
- Produces: semantic anchors `demo`, `how-it-works`, and `privacy`.

- [ ] **Step 1: Add failing static-document assertions**

Assert navigation and policy URLs, accessible demo region, four stage controls, Pause, Replay, release-preparation status, and absence of bank-link/download claims.

- [ ] **Step 2: Run the static contract and verify RED**

Run: `node scripts/test-public-landing.mjs`
Expected: FAIL against the old inline-style page.

- [ ] **Step 3: Replace the page with the approved seven-section HTML**

Include the completed ledger fallback in HTML, exact fictional rows, local-first trust strip, present mobile capabilities, explicit tool limits, and legal/support footer.

- [ ] **Step 4: Build the scoped responsive stylesheet and bindings**

Apply the Porcelain/Ledger/Money/Coral/Grid tokens, IntersectionObserver suspension, mobile-menu semantics, reduced motion, stage selection, pause, and replay.

- [ ] **Step 5: Run the static contract and security scan**

Run: `node scripts/test-public-landing.mjs && node scripts/scan-secrets.mjs --tracked --paths public`
Expected: PASS.

### Task 3: CI and visual release gate

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `.github/workflows/ios-ci.yml`

- [ ] **Step 1: Write the failing workflow assertion in the static contract**

Require both workflows to invoke `node scripts/test-public-landing.mjs` before publication or mobile completion.

- [ ] **Step 2: Run the contract and verify RED**

Run: `node scripts/test-public-landing.mjs`
Expected: FAIL because the workflow steps are absent.

- [ ] **Step 3: Add the static landing gate to both workflows**

Use the existing Node 22 environment and run the contract before upload/security completion.

- [ ] **Step 4: Capture desktop, tablet, 390-pixel, and 320-pixel screenshots**

Verify exact ledger columns, wrapped stage controls, release status, keyboard focus, reduced motion, and no horizontal overflow.

- [ ] **Step 5: Run all available verification and commit**

Run: `node scripts/test-public-landing.mjs && node scripts/scan-secrets.mjs --tracked --paths public && cd mobile && npm test -- --runInBand && npm run typecheck && npm run lint`
Expected: PASS, including legacy-web quarantine tests.
