import React, { useState, useEffect } from 'react';
import './Tour.css';

const TOUR_STEPS = [
  {
    target: 'nav-dashboard',
    title: 'Dashboard',
    body: 'Your financial command center. See income, expenses, net savings, and budget alerts all in one place.',
    icon: '◈',
    position: 'right',
  },
  {
    target: 'nav-transactions',
    title: 'Transactions',
    body: 'Log every dollar in or out. Search, filter by category, and add transactions in seconds.',
    icon: '⇄',
    position: 'right',
  },
  {
    target: 'nav-analytics',
    title: 'Analytics',
    body: 'Visual charts showing your 6-month income vs expense trends, and spending by category.',
    icon: '◎',
    position: 'right',
  },
  {
    target: 'nav-budgets',
    title: 'Budgets',
    body: 'Set monthly spending limits per category. Finova alerts you when you\'re getting close or over.',
    icon: '◇',
    position: 'right',
  },
  {
    target: 'nav-bills',
    title: 'Bills Tracker',
    body: 'Track all your recurring bills — rent, Netflix, insurance. Never miss a payment.',
    icon: '📋',
    position: 'right',
  },
  {
    target: 'nav-networth',
    title: 'Net Worth',
    body: 'Add your assets and debts to track your net worth over time.',
    icon: '📊',
    position: 'right',
  },
  {
    target: null,
    title: "You're all set!",
    body: 'Start by adding your first transaction, or explore the dashboard to see your budget breakdown.',
    icon: '🎉',
    position: 'center',
  },
];

export default function Tour({ onDone }) {
  const [step, setStep] = useState(0);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="tour-overlay" onClick={e => e.target.classList.contains('tour-overlay') && onDone()}>
      <div className={`tour-card tour-pos-${current.position}`}>
        <div className="tour-step-count">{step + 1} / {TOUR_STEPS.length}</div>
        <div className="tour-icon">{current.icon}</div>
        <div className="tour-title">{current.title}</div>
        <div className="tour-body">{current.body}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onDone}>Skip tour</button>
          <button className="tour-next" onClick={() => isLast ? onDone() : setStep(s => s + 1)}>
            {isLast ? 'Start using Finova →' : 'Next →'}
          </button>
        </div>
        <div className="tour-dots">
          {TOUR_STEPS.map((_, i) => (
            <button key={i} className={`tour-dot ${i === step ? 'active' : ''}`} onClick={() => setStep(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
