import React, { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useFinance } from './hooks/useFinance';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Analytics from './components/Analytics';
import Budgets from './components/Budgets';
import Bills from './components/bills/Bills';
import NetWorth from './components/NetWorth';
import AuthPage from './components/auth/AuthPage';
import Onboarding from './components/onboarding/Onboarding';
import Tour from './components/tour/Tour';
import './App.css';

function AppInner() {
  const { user } = useAuth();
  const [page, setPage]       = useState('dashboard');
  const [showTour, setShowTour] = useState(false);

  const finance = useFinance(user?.id);

  // Not logged in → auth screen
  if (!user) return <AuthPage />;

  // Logged in but not onboarded → onboarding wizard
  if (!finance.onboarded) {
    return (
      <Onboarding
        userName={user.name}
        onComplete={(profile, budgets, txns) => {
          finance.completeOnboarding(profile, budgets, txns);
          setShowTour(true);
        }}
      />
    );
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return (
          <Dashboard
            totalIncome={finance.totalIncome}
            totalExpenses={finance.totalExpenses}
            netSavings={finance.netSavings}
            savingsRate={finance.savingsRate}
            categoryBreakdown={finance.categoryBreakdown}
            budgetAlerts={finance.budgetAlerts}
            currentTxns={finance.currentTxns}
            selectedMonth={finance.selectedMonth}
            setSelectedMonth={finance.setSelectedMonth}
            monthlyTrend={finance.monthlyTrend}
            profile={finance.profile}
            onNavigate={setPage}
          />
        );
      case 'transactions':
        return (
          <Transactions
            currentTxns={finance.currentTxns}
            addTransaction={finance.addTransaction}
            deleteTransaction={finance.deleteTransaction}
          />
        );
      case 'analytics':
        return (
          <Analytics
            monthlyTrend={finance.monthlyTrend}
            categoryBreakdown={finance.categoryBreakdown}
            totalIncome={finance.totalIncome}
            totalExpenses={finance.totalExpenses}
            netSavings={finance.netSavings}
          />
        );
      case 'budgets':
        return (
          <Budgets
            budgets={finance.budgets}
            budgetAlerts={finance.budgetAlerts}
            updateBudget={finance.updateBudget}
            categoryBreakdown={finance.categoryBreakdown}
          />
        );
      case 'bills':
        return (
          <Bills
            transactions={finance.transactions}
            addTransaction={finance.addTransaction}
            deleteTransaction={finance.deleteTransaction}
          />
        );
      case 'networth':
        return <NetWorth userId={user?.id} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-layout">
      {showTour && <Tour onDone={() => setShowTour(false)} />}
      <Sidebar active={page} onChange={setPage} />
      <main className="main-content">
        <div className="content-inner">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
