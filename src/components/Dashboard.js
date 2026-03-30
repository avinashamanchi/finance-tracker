import React from 'react';
import { format, subMonths } from 'date-fns';
import { getCat } from '../hooks/useFinance';
import './Dashboard.css';

function StatCard({ label, value, sub, color, icon, delay=0, trend }) {
  return (
    <div className="stat-card" style={{animationDelay:`${delay}ms`}}>
      <div className="stat-header">
        <div className="stat-icon-wrap" style={{background:`${color}15`,border:`1px solid ${color}25`}}>
          <span style={{color}}>{icon}</span>
        </div>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value" style={{color}}>{value}</div>
      <div className="stat-footer">
        {sub && <span className="stat-sub">{sub}</span>}
        {trend !== undefined && (
          <span className={`stat-trend ${trend >= 0 ? 'up' : 'down'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({
  totalIncome, totalExpenses, netSavings, savingsRate,
  categoryBreakdown, budgetAlerts, currentTxns, selectedMonth, setSelectedMonth,
  onNavigate, profile, monthlyTrend,
}) {
  const fmt = v => `$${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
  const fmtFull = v => `$${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const topCategories = Object.entries(categoryBreakdown).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const recentTxns = [...currentTxns].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  const overAlerts = budgetAlerts.filter(a=>a.over);
  const warnAlerts = budgetAlerts.filter(a=>a.warning);

  const months = Array.from({length:6},(_,i)=>{
    const d = subMonths(new Date(),i);
    return format(d,'yyyy-MM');
  });

  // prev month comparison
  const prevMonth = format(subMonths(new Date(selectedMonth+'-01'),1),'yyyy-MM');
  const prevTrend = monthlyTrend.find(m=>m.fullMonth === format(new Date(prevMonth+'-01'),'MMMM yyyy'));
  const expenseTrend = prevTrend && prevTrend.expenses > 0
    ? ((totalExpenses - prevTrend.expenses) / prevTrend.expenses) * 100 : undefined;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const hasData = currentTxns.length > 0;

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-greeting">
            {greeting()}, {profile?.firstName || 'there'} 👋
          </h1>
          <p className="dash-sub">Here's your financial snapshot for{' '}
            <select className="month-picker-inline" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>
              {months.map(m=>(
                <option key={m} value={m}>{format(new Date(m+'-01'),'MMMM yyyy')}</option>
              ))}
            </select>
          </p>
        </div>
        {(overAlerts.length > 0 || warnAlerts.length > 0) && (
          <div className="dash-alert-chip" onClick={()=>onNavigate('budgets')}>
            {overAlerts.length > 0
              ? `🔴 ${overAlerts.length} budget${overAlerts.length>1?'s':''} over limit`
              : `🟡 ${warnAlerts.length} budget${warnAlerts.length>1?'s':''} near limit`}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <StatCard label="Monthly Income" icon="↑" value={fmt(totalIncome)}
          color="var(--accent)" sub={hasData?'This month':'No income yet'} delay={0} />
        <StatCard label="Total Spent" icon="↓" value={fmt(totalExpenses)}
          color="var(--red)" sub={hasData?'This month':'No expenses yet'} delay={60}
          trend={expenseTrend} />
        <StatCard label="Left to Spend" icon="◈" value={netSavings>=0?fmt(netSavings):`-${fmt(Math.abs(netSavings))}`}
          color={netSavings>=0?'var(--accent-2)':'var(--red)'}
          sub={netSavings>=0?'Available':'Over budget'} delay={120} />
        <StatCard label="Savings Rate" icon="%" value={`${Math.max(0,savingsRate).toFixed(1)}%`}
          color="var(--gold)" sub={profile?.savingsGoalPct?`Goal: ${profile.savingsGoalPct}%`:'of income'} delay={180} />
      </div>

      {/* Budget progress + Spending breakdown */}
      {!hasData ? (
        <div className="dash-empty">
          <div className="dash-empty-icon">📊</div>
          <h3>No transactions yet</h3>
          <p>Add your first transaction to see your spending breakdown and budget progress.</p>
          <button className="dash-empty-btn" onClick={()=>onNavigate('transactions')}>+ Add Transaction</button>
        </div>
      ) : (
        <>
          {/* Budget progress bars */}
          {budgetAlerts.filter(a=>a.limit>0&&a.spent>0).length > 0 && (
            <div className="dash-section">
              <div className="dash-section-header">
                <span className="dash-section-title">Budget Progress</span>
                <button className="dash-section-link" onClick={()=>onNavigate('budgets')}>View all →</button>
              </div>
              <div className="budget-bars">
                {budgetAlerts.filter(a=>a.limit>0&&a.spent>0).slice(0,6).map(a=>{
                  const cat = getCat(a.category);
                  return (
                    <div key={a.category} className="budget-bar-row">
                      <div className="bbr-left">
                        <span className="bbr-icon">{cat.icon}</span>
                        <span className="bbr-name">{cat.label}</span>
                      </div>
                      <div className="bbr-center">
                        <div className="bbr-track">
                          <div className="bbr-fill" style={{
                            width:`${Math.min(a.pct,100)}%`,
                            background: a.over ? 'var(--red)' : a.warning ? 'var(--gold)' : cat.color,
                          }} />
                        </div>
                      </div>
                      <div className="bbr-right">
                        <span className="bbr-spent" style={{color: a.over?'var(--red)':a.warning?'var(--gold)':cat.color}}>
                          ${a.spent.toFixed(0)}
                        </span>
                        <span className="bbr-limit">/ ${a.limit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Spending by category */}
          {topCategories.length > 0 && (
            <div className="dash-mid-row">
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Top Spending</span>
                  <button className="dash-section-link" onClick={()=>onNavigate('analytics')}>Analytics →</button>
                </div>
                <div className="cat-spend-list">
                  {topCategories.map(([catId, amt])=>{
                    const cat = getCat(catId);
                    const pct = totalExpenses > 0 ? (amt/totalExpenses)*100 : 0;
                    return (
                      <div key={catId} className="cat-spend-row">
                        <div className="csr-icon" style={{background:`${cat.color}18`}}>{cat.icon}</div>
                        <div className="csr-info">
                          <div className="csr-top">
                            <span className="csr-name">{cat.label}</span>
                            <span className="csr-amt" style={{color:cat.color}}>{fmtFull(amt)}</span>
                          </div>
                          <div className="csr-bar-track">
                            <div className="csr-bar-fill" style={{width:`${pct}%`,background:cat.color}} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent transactions */}
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Recent Transactions</span>
                  <button className="dash-section-link" onClick={()=>onNavigate('transactions')}>View all →</button>
                </div>
                <div className="recent-txn-list">
                  {recentTxns.map(t=>{
                    const cat = getCat(t.category);
                    return (
                      <div key={t.id} className="rtl-row">
                        <div className="rtl-icon" style={{background:`${cat.color}18`}}>{cat.icon}</div>
                        <div className="rtl-info">
                          <span className="rtl-desc">{t.description}</span>
                          <span className="rtl-cat">{cat.label} · {format(new Date(t.date+'T00:00:00'),'MMM d')}</span>
                        </div>
                        <span className={`rtl-amt ${t.type}`}>
                          {t.type==='income'?'+':'-'}{fmtFull(t.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
