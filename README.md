# 💎 Finova — Personal Finance Tracker

A premium dark-themed personal finance tracker built with React + Chart.js. Track income and expenses, visualize spending trends, and manage budgets with real-time alerts.

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

> Developed a full-stack personal finance tracker with React and Chart.js, featuring real-time budget alerts, 6-month spending trend analysis, and a responsive dark-themed UI with localStorage persistence.

---

## 🚀 Deploy to Vercel (Free)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Leave all defaults → Deploy

Done — live site in under 2 minutes.
