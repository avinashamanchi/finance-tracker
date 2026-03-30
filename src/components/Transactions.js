import React, { useState } from 'react';
import { format } from 'date-fns';
import { CATEGORIES, getCat } from '../hooks/useFinance';
import './Transactions.css';

const EMPTY_FORM = { type:'expense', amount:'', category:'groceries', description:'', date:'' };

export default function Transactions({ currentTxns, addTransaction, deleteTransaction }) {
  const [showForm, setShowForm]     = useState(false);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [form, setForm]             = useState({...EMPTY_FORM, date:format(new Date(),'yyyy-MM-dd')});
  const [errors, setErrors]         = useState({});
  const [deleting, setDeleting]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fmt = v => `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const filtered = [...currentTxns]
    .filter(t => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (search && !t.description?.toLowerCase().includes(search.toLowerCase()) &&
          !getCat(t.category).label.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a,b) => new Date(b.date)-new Date(a.date));

  const validate = () => {
    const e = {};
    if (!form.amount || isNaN(parseFloat(form.amount))) e.amount = 'Enter a valid amount';
    else if (parseFloat(form.amount) <= 0) e.amount = 'Amount must be greater than $0';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!form.date) e.date = 'Date is required';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    addTransaction({...form, amount:parseFloat(parseFloat(form.amount).toFixed(2))});
    setForm({...EMPTY_FORM, date:format(new Date(),'yyyy-MM-dd')});
    setErrors({});
    setShowForm(false);
  };

  const handleDeleteConfirm = () => {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.id);
    setTimeout(() => { deleteTransaction(confirmDelete.id); setDeleting(null); setConfirmDelete(null); }, 300);
  };

  const incomeCats  = CATEGORIES.income;
  const expenseCats = CATEGORIES.expense;
  const cats = form.type === 'income' ? incomeCats : expenseCats;

  return (
    <div className="transactions-page">
      {confirmDelete && (
        <div className="modal-overlay" onClick={()=>setConfirmDelete(null)}>
          <div className="confirm-modal" onClick={e=>e.stopPropagation()}>
            <div className="confirm-icon">🗑</div>
            <div className="confirm-title">Delete Transaction?</div>
            <div className="confirm-body">
              <strong>{confirmDelete.description}</strong><br/>
              <span className={confirmDelete.type}>{confirmDelete.type==='income'?'+':'-'}{fmt(confirmDelete.amount)}</span>
            </div>
            <p className="confirm-note">This cannot be undone.</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={()=>setConfirmDelete(null)}>Cancel</button>
              <button className="confirm-delete" onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">{currentTxns.length} transaction{currentTxns.length!==1?'s':''} this month</p>
        </div>
        <button className="btn-add" onClick={()=>{setShowForm(v=>!v);setErrors({});}}>
          {showForm?'✕ Cancel':'+ Add Transaction'}
        </button>
      </div>

      {showForm && (
        <div className="add-form-card">
          <div className="form-title">New Transaction</div>
          <div className="form-type-toggle">
            {['expense','income'].map(t=>(
              <button key={t}
                className={`type-btn ${form.type===t?'active '+t:''}`}
                onClick={()=>setForm(f=>({...f,type:t,category:t==='income'?'salary':'groceries'}))}>
                {t==='expense'?'↓ Expense':'↑ Income'}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <div className={`form-group ${errors.amount?'has-error':''}`}>
              <label>Amount</label>
              <div className="curr-wrap">
                <span className="curr-sign">$</span>
                <input type="number" className="curr-input" placeholder="0.00" min="0.01" step="0.01"
                  value={form.amount}
                  onChange={e=>{setForm(f=>({...f,amount:e.target.value}));setErrors(er=>({...er,amount:undefined}));}} />
              </div>
              {errors.amount && <span className="field-error">{errors.amount}</span>}
            </div>
            <div className={`form-group ${errors.date?'has-error':''}`}>
              <label>Date</label>
              <input type="date" className="ob-input" value={form.date}
                onChange={e=>{setForm(f=>({...f,date:e.target.value}));setErrors(er=>({...er,date:undefined}));}} />
              {errors.date && <span className="field-error">{errors.date}</span>}
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="ob-input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div className={`form-group ${errors.description?'has-error':''}`}>
              <label>Description</label>
              <input type="text" className="ob-input" placeholder="What was this for?" value={form.description}
                onChange={e=>{setForm(f=>({...f,description:e.target.value}));setErrors(er=>({...er,description:undefined}));}}
                onKeyDown={e=>e.key==='Enter'&&handleSubmit()} />
              {errors.description && <span className="field-error">{errors.description}</span>}
            </div>
          </div>
          <button className="btn-submit" onClick={handleSubmit}>Add Transaction</button>
        </div>
      )}

      <div className="filter-row">
        <div className="filter-tabs">
          {['all','expense','income'].map(f=>(
            <button key={f} className={`filter-tab ${filter===f?'active':''}`} onClick={()=>setFilter(f)}>
              {f==='all'?'All':f==='expense'?'Expenses':'Income'}
            </button>
          ))}
        </div>
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input className="search-input" type="text" placeholder="Search..."
            value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={()=>setSearch('')}>✕</button>}
        </div>
      </div>

      <div className="txn-table-card">
        {filtered.length === 0 ? (
          <div className="empty-state-txn">
            <div className="est-icon">{search?'🔍':filter!=='all'?'📂':'📋'}</div>
            <div className="est-title">{search?`No results for "${search}"`:filter!=='all'?`No ${filter}s this month`:'No transactions this month'}</div>
            <div className="est-sub">{search?'Try a different search term':'Add a transaction using the button above'}</div>
          </div>
        ) : (
          <div className="txn-table">
            <div className="table-header">
              <span>Transaction</span><span>Category</span><span>Date</span>
              <span style={{textAlign:'right'}}>Amount</span><span></span>
            </div>
            {filtered.map(t=>{
              const cat = getCat(t.category);
              return (
                <div key={t.id} className={`table-row ${deleting===t.id?'deleting':''}`}>
                  <div className="row-desc">
                    <div className="row-icon" style={{background:`${cat.color}20`}}>{cat.icon}</div>
                    <span className="row-desc-text">{t.description}</span>
                  </div>
                  <span className="cat-chip" style={{background:`${cat.color}18`,color:cat.color}}>{cat.label}</span>
                  <span className="row-date">{format(new Date(t.date+'T00:00:00'),'MMM d, yyyy')}</span>
                  <span className={`row-amount ${t.type}`} style={{textAlign:'right'}}>
                    {t.type==='income'?'+':'-'}{fmt(t.amount)}
                  </span>
                  <button className="delete-btn" onClick={()=>setConfirmDelete(t)}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
