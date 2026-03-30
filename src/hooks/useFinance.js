import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, parseISO, addMonths } from 'date-fns';

export const CATEGORIES = {
  income: [
    { id:'salary',    label:'Salary',       icon:'💼', color:'#00d4aa' },
    { id:'freelance', label:'Freelance',     icon:'💻', color:'#3b82f6' },
    { id:'business',  label:'Business',      icon:'🏢', color:'#8b5cf6' },
    { id:'investment',label:'Investments',   icon:'📈', color:'#f59e0b' },
    { id:'gift',      label:'Gift/Bonus',    icon:'🎁', color:'#ec4899' },
    { id:'other_in',  label:'Other Income',  icon:'💰', color:'#6b7280' },
  ],
  expense: [
    { id:'rent',      label:'Rent/Mortgage', icon:'🏠', color:'#f59e0b' },
    { id:'utilities', label:'Utilities',     icon:'⚡', color:'#3b82f6' },
    { id:'groceries', label:'Groceries',     icon:'🛒', color:'#00d4aa' },
    { id:'dining',    label:'Dining Out',    icon:'🍽', color:'#f97316' },
    { id:'transport', label:'Transport',     icon:'🚗', color:'#60a5fa' },
    { id:'health',    label:'Health',        icon:'💊', color:'#34d399' },
    { id:'insurance', label:'Insurance',     icon:'🛡', color:'#a78bfa' },
    { id:'subscriptions', label:'Subscriptions', icon:'📱', color:'#ec4899' },
    { id:'shopping',  label:'Shopping',      icon:'🛍', color:'#f472b6' },
    { id:'entertainment',label:'Entertainment',icon:'🎬',color:'#8b5cf6' },
    { id:'education', label:'Education',     icon:'📚', color:'#06b6d4' },
    { id:'savings',   label:'Savings/Invest',icon:'🏦', color:'#10b981' },
    { id:'personal',  label:'Personal Care', icon:'🧴', color:'#fb7185' },
    { id:'kids',      label:'Kids/Family',   icon:'👨‍👩‍👧', color:'#fbbf24' },
    { id:'pets',      label:'Pets',          icon:'🐾', color:'#a3e635' },
    { id:'travel',    label:'Travel',        icon:'✈️', color:'#38bdf8' },
    { id:'gifts_out', label:'Gifts/Charity', icon:'🎀', color:'#f43f5e' },
    { id:'other_ex',  label:'Other',         icon:'📦', color:'#6b7280' },
  ],
};

export const ALL_CATS = [...CATEGORIES.income, ...CATEGORIES.expense];
export function getCat(id) { return ALL_CATS.find(c=>c.id===id) || { id, label:id, icon:'📦', color:'#6b7280' }; }

const DEFAULT_BUDGETS = {
  rent:1500, utilities:200, groceries:400, dining:200, transport:200,
  health:100, insurance:150, subscriptions:50, shopping:200,
  entertainment:100, education:50, savings:300, personal:80,
  kids:0, pets:0, travel:100, gifts_out:50, other_ex:100,
};

function sk(userId, type) { return `finova_${userId}_${type}`; }
function load(key) { try { const r=localStorage.getItem(key); return r?JSON.parse(r):null; } catch { return null; } }
function save(key, val) { try { localStorage.setItem(key,JSON.stringify(val)); } catch {} }

export function useFinance(userId) {
  const txnKey    = sk(userId||'guest','transactions');
  const budgetKey = sk(userId||'guest','budgets');
  const profileKey= sk(userId||'guest','profile');
  const onboardKey= sk(userId||'guest','onboarded');

  const [transactions, setTransactions] = useState(() => load(txnKey) || []);
  const [budgets, setBudgets]           = useState(() => load(budgetKey) || DEFAULT_BUDGETS);
  const [profile, setProfileState]      = useState(() => load(profileKey) || null);
  const [onboarded, setOnboarded]       = useState(() => !!load(onboardKey));
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(),'yyyy-MM'));

  const prevUserId = React.useRef(userId);
  useEffect(() => {
    if (prevUserId.current === userId) return;
    prevUserId.current = userId;
    setTransactions(load(sk(userId||'guest','transactions')) || []);
    setBudgets(load(sk(userId||'guest','budgets')) || DEFAULT_BUDGETS);
    setProfileState(load(sk(userId||'guest','profile')) || null);
    setOnboarded(!!load(sk(userId||'guest','onboarded')));
  }, [userId]);

  useEffect(() => { if(userId) save(txnKey, transactions); }, [transactions, txnKey, userId]);
  useEffect(() => { if(userId) save(budgetKey, budgets); }, [budgets, budgetKey, userId]);
  useEffect(() => { if(userId) save(profileKey, profile); }, [profile, profileKey, userId]);

  const completeOnboarding = useCallback((profileData, budgetData, seedTransactions) => {
    setProfileState(profileData);
    setBudgets(budgetData);
    if (seedTransactions && seedTransactions.length > 0) {
      setTransactions(seedTransactions);
    }
    setOnboarded(true);
    save(sk(userId||'guest','onboarded'), true);
  }, [userId]);

  const monthTransactions = useCallback((monthStr) => {
    const [y,m] = monthStr.split('-').map(Number);
    const start = startOfMonth(new Date(y,m-1));
    const end   = endOfMonth(new Date(y,m-1));
    return transactions.filter(t => {
      try { return isWithinInterval(parseISO(t.date),{start,end}); } catch { return false; }
    });
  }, [transactions]);

  const currentTxns  = monthTransactions(selectedMonth);
  const totalIncome  = currentTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExpenses= currentTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const netSavings   = totalIncome - totalExpenses;
  const savingsRate  = totalIncome>0 ? (netSavings/totalIncome)*100 : 0;

  const categoryBreakdown = {};
  currentTxns.filter(t=>t.type==='expense').forEach(t => {
    categoryBreakdown[t.category] = (categoryBreakdown[t.category]||0) + t.amount;
  });

  const budgetAlerts = Object.entries(budgets).map(([cat,limit]) => {
    const spent = categoryBreakdown[cat]||0;
    const pct   = limit>0 ? (spent/limit)*100 : 0;
    return { category:cat, spent, limit, pct, over:pct>=100, warning:pct>=80&&pct<100 };
  }).filter(a=>a.limit>0);

  const monthlyTrend = Array.from({length:6},(_,i)=>{
    const d = subMonths(new Date(),5-i);
    const key = format(d,'yyyy-MM');
    const txns = monthTransactions(key);
    const income   = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expenses = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    return { month:format(d,'MMM'), fullMonth:format(d,'MMMM yyyy'), income, expenses, savings:income-expenses };
  });

  // Bills = recurring expenses
  const bills = transactions.filter(t=>t.type==='expense'&&t.isRecurring);

  const addTransaction = (txn) => setTransactions(prev=>[{...txn,id:uuidv4(),...(!txn.id&&{})},  ...prev]);
  const deleteTransaction = (id) => setTransactions(prev=>prev.filter(t=>t.id!==id));
  const updateBudget = (cat,val) => setBudgets(prev=>({...prev,[cat]:Number(val)}));
  const setProfile = (p) => setProfileState(p);

  return {
    transactions, selectedMonth, setSelectedMonth,
    currentTxns, totalIncome, totalExpenses, netSavings, savingsRate,
    categoryBreakdown, budgets, budgetAlerts, monthlyTrend, bills,
    profile, onboarded, completeOnboarding,
    addTransaction, deleteTransaction, updateBudget, setProfile,
    monthTransactions,
  };
}
