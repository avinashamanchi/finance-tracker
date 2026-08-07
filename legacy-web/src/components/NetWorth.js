import React, { useState, useEffect } from 'react';
import './NetWorth.css';

const ASSET_CATS = [
  { id:'checking', label:'Checking Account', icon:'🏦' },
  { id:'savings_acc', label:'Savings Account', icon:'💰' },
  { id:'investment', label:'Investments / Stocks', icon:'📈' },
  { id:'retirement', label:'401k / IRA', icon:'🌴' },
  { id:'property', label:'Real Estate', icon:'🏠' },
  { id:'crypto', label:'Crypto', icon:'₿' },
  { id:'vehicle', label:'Vehicle Value', icon:'🚗' },
  { id:'other_asset', label:'Other Asset', icon:'💎' },
];
const DEBT_CATS = [
  { id:'credit_card', label:'Credit Cards', icon:'💳' },
  { id:'student_loan', label:'Student Loans', icon:'🎓' },
  { id:'car_loan', label:'Car Loan', icon:'🚗' },
  { id:'mortgage', label:'Mortgage', icon:'🏠' },
  { id:'personal_loan', label:'Personal Loan', icon:'🏛' },
  { id:'medical', label:'Medical Debt', icon:'🏥' },
  { id:'other_debt', label:'Other Debt', icon:'📋' },
];

function nwKey(userId) { return `finova_${userId||'guest'}_networth`; }

export default function NetWorth({ userId }) {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(nwKey(userId))||'{"assets":{},"debts":{}}'); } catch { return { assets:{}, debts:{} }; }
  });

  useEffect(() => {
    localStorage.setItem(nwKey(userId), JSON.stringify(data));
  }, [data, userId]);

  const set = (type, id, val) => {
    setData(d=>({...d,[type]:{...d[type],[id]:val===''?0:Number(val)}}));
  };

  const totalAssets = Object.values(data.assets).reduce((s,v)=>s+v,0);
  const totalDebts  = Object.values(data.debts).reduce((s,v)=>s+v,0);
  const netWorth    = totalAssets - totalDebts;
  const fmt = v => `$${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:0})}`;

  return (
    <div className="networth-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Net Worth</h1>
          <p className="page-subtitle">Track your assets, debts, and overall financial health</p>
        </div>
      </div>

      {/* Big number */}
      <div className="nw-hero">
        <div className="nw-hero-label">Total Net Worth</div>
        <div className={`nw-hero-val ${netWorth >= 0 ? 'positive' : 'negative'}`}>
          {netWorth < 0 ? '-' : ''}{fmt(netWorth)}
        </div>
        <div className="nw-hero-sub">Assets minus Debts</div>
        <div className="nw-hero-bar">
          {totalAssets + totalDebts > 0 && (
            <>
              <div className="nw-bar-assets" style={{width:`${(totalAssets/(totalAssets+totalDebts))*100}%`}} />
              <div className="nw-bar-debts" style={{width:`${(totalDebts/(totalAssets+totalDebts))*100}%`}} />
            </>
          )}
        </div>
        <div className="nw-bar-legend">
          <span className="nw-leg-assets">● Assets: {fmt(totalAssets)}</span>
          <span className="nw-leg-debts">● Debts: {fmt(totalDebts)}</span>
        </div>
      </div>

      <div className="nw-columns">
        {/* Assets */}
        <div className="nw-section">
          <div className="nw-section-header assets">
            <span>Assets</span>
            <span className="nw-section-total accent">{fmt(totalAssets)}</span>
          </div>
          {ASSET_CATS.map(c=>(
            <div key={c.id} className="nw-row">
              <div className="nw-row-left">
                <span className="nw-row-icon">{c.icon}</span>
                <span className="nw-row-label">{c.label}</span>
              </div>
              <div className="nw-row-input-wrap">
                <span className="nw-sign">$</span>
                <input type="number" className="nw-input" min="0"
                  placeholder="0"
                  value={data.assets[c.id]||''}
                  onChange={e=>set('assets',c.id,e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Debts */}
        <div className="nw-section">
          <div className="nw-section-header debts">
            <span>Debts</span>
            <span className="nw-section-total red">{fmt(totalDebts)}</span>
          </div>
          {DEBT_CATS.map(c=>(
            <div key={c.id} className="nw-row">
              <div className="nw-row-left">
                <span className="nw-row-icon">{c.icon}</span>
                <span className="nw-row-label">{c.label}</span>
              </div>
              <div className="nw-row-input-wrap">
                <span className="nw-sign red">$</span>
                <input type="number" className="nw-input" min="0"
                  placeholder="0"
                  value={data.debts[c.id]||''}
                  onChange={e=>set('debts',c.id,e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
