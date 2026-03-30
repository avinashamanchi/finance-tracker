import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import './Sidebar.css';

const NAV = [
  { id:'dashboard',    icon:'◈', label:'Dashboard' },
  { id:'transactions', icon:'⇄', label:'Transactions' },
  { id:'analytics',    icon:'◎', label:'Analytics' },
  { id:'budgets',      icon:'◇', label:'Budgets' },
  { id:'bills',        icon:'📋', label:'Bills' },
  { id:'networth',     icon:'📊', label:'Net Worth' },
];

export default function Sidebar({ active, onChange }) {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [active]);
  useEffect(() => {
    const fn = () => { if(window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const initials = user?.name ? user.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '??';

  return (
    <>
      <button className="hamburger" onClick={()=>setMobileOpen(v=>!v)} aria-label="Toggle menu">
        <span className={`ham-line ${mobileOpen?'open':''}`} />
        <span className={`ham-line ${mobileOpen?'open':''}`} />
        <span className={`ham-line ${mobileOpen?'open':''}`} />
      </button>
      {mobileOpen && <div className="sidebar-overlay" onClick={()=>setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen?'mobile-open':''}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">Finova</span>
        </div>
        <nav className="sidebar-nav" id="sidebar-nav">
          {NAV.map(item=>(
            <button key={item.id} id={`nav-${item.id}`}
              className={`nav-item ${active===item.id?'active':''}`}
              onClick={()=>onChange(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {active===item.id && <span className="nav-active-bar" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-row">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <span className="user-name">{user?.name||'User'}</span>
              <span className="user-email">{user?.email||''}</span>
            </div>
          </div>
          <button className="signout-btn" onClick={signOut}>⎋ Sign Out</button>
        </div>
      </aside>
    </>
  );
}
