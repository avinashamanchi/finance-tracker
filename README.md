# 💎 Finova — Personal Finance Tracker

A premium dark-themed personal finance tracker built with React + Chart.js. Track income and expenses, visualize spending trends, and manage budgets with real-time alerts.

## 📱 iOS app

The `mobile/` directory contains the iOS-first Expo/React Native implementation. It is a local-only, empty-by-default ledger with integer-cent arithmetic, transaction CRUD/search/filter, monthly category budgets, six-month insights, strict JSON backup import, CSV export, coordinated deletion, and in-app privacy/support limits.

Core flows are Expo Go compatible:

```bash
cd mobile
npm ci
npm start
```

Scan the QR code in Expo Go while the phone and Mac are on the same network. Expo Go observation is a device checkpoint, not proof of a signed TestFlight/App Store build.

Local release gates:

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

App Store drafts and the explicit external blockers are in `docs/app-store/`. No signing, submission, approval, or publication is claimed by this repository.

---

## ✨ Features

- **Dashboard** — Live summary cards (income, expenses, net savings, savings rate), category breakdown, budget alerts, recent transactions
- **Transactions** — Add/delete transactions with categories, full search and filter, animated table
- **Analytics** — 6-month bar charts, category doughnut chart, savings trend line, monthly summary table
- **Budgets** — Per-category budget limits, inline editing, visual progress bars with over/warning states
- **Persistent storage** — All data saved to localStorage, seeded with 6 months of realistic demo data
- **Luxury dark UI** — Playfair Display + DM Sans, gold accents, animated cards, smooth transitions

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v16 or higher — [Download here](https://nodejs.org)
- **npm** (comes with Node)

### Install & Run

```bash
# 1. Navigate to the project folder
cd finance-tracker

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Start the dev server
npm start
```

The app will open at **http://localhost:3000** automatically.

### Build for Production

```bash
npm run build
```

Outputs a production build to the `/build` folder — ready to deploy to Vercel, Netlify, or any static host.

---

## 📁 Project Structure

```
finance-tracker/
├── public/
│   └── index.html            # HTML shell with Google Fonts
├── src/
│   ├── App.js                # Root component + page routing
│   ├── App.css               # Layout + background gradients
│   ├── index.js              # React entry point
│   ├── index.css             # Global variables, resets, keyframe animations
│   ├── hooks/
│   │   └── useFinance.js     # All state, localStorage, derived values
│   └── components/
│       ├── Sidebar.js/.css   # Navigation sidebar
│       ├── Dashboard.js/.css # Overview page
│       ├── Transactions.js/.css  # Transaction log + add form
│       ├── Analytics.js/.css    # Charts (Bar, Line, Doughnut)
│       └── Budgets.js/.css      # Budget cards with inline editing
└── package.json
```

---

## 🎨 Design System

| Token | Value |
|---|---|
| Background base | `#080a0e` |
| Card background | `#111720` |
| Gold accent | `#c9a84c` |
| Teal accent | `#2dd4bf` |
| Display font | Playfair Display |
| Body font | DM Sans |

---

## 🛠 Tech Stack

- **React 18** — UI framework
- **Chart.js 4 + react-chartjs-2** — Bar, Line, and Doughnut charts
- **date-fns** — Date formatting and manipulation
- **uuid** — Unique transaction IDs
- **localStorage** — Client-side persistence (no backend needed)

---

## 📊 Resume Bullet

> Developed local-first web and Expo/React Native personal finance trackers with budget alerts, six-month trend analysis, privacy controls, and offline persistence.

---

## 🚀 Deploy to Vercel (Free)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Leave all defaults → Deploy

Done — live site in under 2 minutes.
