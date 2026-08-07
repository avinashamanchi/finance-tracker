import React, { useState } from 'react';
import { CATEGORIES, getCat } from '../hooks/useFinance';
import './Budgets.css';

export default function Budgets({ budgets, budgetAlerts, updateBudget, categoryBreakdown }) {
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');

  const allExpCats = CATEGORIES.expense;
  const totalBudget = Object.values(budgets).reduce((s,v)=>s+v,0);
  const totalSpent  = Object.values(categoryBreakdown).reduce((s,v)=>s+v,0);
  const overCount   = budgetAlerts.filter(a=>a.over).length;

  const fmt = v => `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  return (
    <div className="budgets-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Budgets</h1>
          <p className="page-subtitle">Set monthly limits and track your spending</p>
        </div>
      </div>

      <div className="budget-overview">
        {[
          { label:'Total Budget', val:fmt(totalBudget), cls:'gold' },
          { label:'Total Spent', val:fmt(totalSpent), cls:'red' },
          { label:'Remaining', val:fmt(totalBudget-totalSpent), cls:totalBudget-totalSpent>=0?'accent':'red' },
          { label:'Over Budget', val:`${overCount} ${overCount===1?'category':'categories'}`, cls:overCount>0?'red':'accent' },
        ].map(s=>(
          <div key={s.label} className="ov-stat">
            <div className="ov-label">{s.label}</div>
            <div className={`ov-val ${s.cls}`}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="budget-grid">
        {allExpCats.map((cat,i)=>{
          const limit = budgets[cat.id]||0;
          const spent = categoryBreakdown[cat.id]||0;
          const pct   = limit>0 ? Math.min((spent/limit)*100,100) : 0;
          const over    = spent > limit && limit > 0;
          const warning = pct >= 80 && !over;

          return (
            <div key={cat.id}
              className={`budget-card ${over?'over':warning?'warning':''}`}
              style={{animationDelay:`${i*30}ms`}}>
              <div className="bc-header">
                <div className="bc-left">
                  <span className="bc-icon" style={{background:`${cat.color}18`}}>{cat.icon}</span>
                  <span className="bc-cat">{cat.label}</span>
                </div>
                <span className="bc-status">{over?'🔴':warning?'🟡':'🟢'}</span>
              </div>

              <div className="bc-track-wrap">
                <div className="bc-track">
                  <div className="bc-fill" style={{
                    width:`${pct}%`,
                    background: over?'var(--red)':warning?'var(--gold)':cat.color
                  }} />
                </div>
                <span className="bc-pct">{pct.toFixed(0)}%</span>
              </div>

              <div className="bc-amounts">
                <span className="bc-spent" style={{color:over?'var(--red)':warning?'var(--gold)':cat.color}}>
                  {fmt(spent)} spent
                </span>
                <span className="bc-remaining">
                  {limit > 0 ? (over ? `${fmt(spent-limit)} over` : `${fmt(limit-spent)} left`) : 'No limit set'}
                </span>
              </div>

              <div className="bc-limit-row">
                <span className="bc-limit-label">Budget</span>
                {editing === cat.id ? (
                  <div className="bc-edit-row">
                    <input type="number" className="bc-edit-input"
                      value={editVal}
                      onChange={e=>setEditVal(e.target.value)}
                      onKeyDown={e=>{
                        if(e.key==='Enter'){updateBudget(cat.id,editVal);setEditing(null);}
                        if(e.key==='Escape') setEditing(null);
                      }}
                      autoFocus
                    />
                    <button className="bc-save-btn" onClick={()=>{updateBudget(cat.id,editVal);setEditing(null);}}>✓</button>
                    <button className="bc-cancel-btn" onClick={()=>setEditing(null)}>✕</button>
                  </div>
                ) : (
                  <button className="bc-limit-val" onClick={()=>{setEditing(cat.id);setEditVal(String(limit));}}>
                    {limit>0?fmt(limit):'Set limit'} <span className="edit-hint">✎</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
