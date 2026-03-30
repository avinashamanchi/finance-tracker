import React, { useState } from 'react';
import { format, addMonths, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { getCat, CATEGORIES } from '../../hooks/useFinance';
import './Bills.css';

const BILL_CATS = CATEGORIES.expense.map(c=>({...c}));

export default function Bills({ transactions, addTransaction, deleteTransaction }) {
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({
    description:'', amount:'', category:'subscriptions',
    dueDay:'1', frequency:'monthly',
  });
  const [errors, setErrors] = useState({});

  const bills = transactions.filter(t=>t.type==='expense'&&t.isRecurring)
    .sort((a,b)=>Number(a.dueDay||1)-Number(b.dueDay||1));

  const totalMonthly = bills.reduce((s,b)=>{
    if (b.frequency==='annual') return s + b.amount/12;
    if (b.frequency==='weekly') return s + b.amount*4.33;
    return s + b.amount;
  }, 0);

  const today = new Date().getDate();
  const upcomingBills = bills.filter(b=>{
    const day = Number(b.dueDay||1);
    return day >= today && day <= today + 10;
  });

  const validate = () => {
    const e = {};
    if (!form.description.trim()) e.description = 'Name required';
    if (!form.amount || parseFloat(form.amount) <= 0) e.amount = 'Enter a valid amount';
    return e;
  };

  const handleAdd = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    addTransaction({
      id: uuidv4(),
      type: 'expense',
      description: form.description,
      amount: parseFloat(form.amount),
      category: form.category,
      date: format(new Date(),'yyyy-MM-dd'),
      isRecurring: true,
      dueDay: Number(form.dueDay),
      frequency: form.frequency,
    });
    setForm({ description:'', amount:'', category:'subscriptions', dueDay:'1', frequency:'monthly' });
    setErrors({});
    setShowForm(false);
  };

  const handleDeleteConfirm = () => {
    if (confirmDelete) { deleteTransaction(confirmDelete.id); setConfirmDelete(null); }
  };

  const fmtFreq = (b) => {
    if (b.frequency==='annual') return `$${b.amount}/yr (${(b.amount/12).toFixed(0)}/mo)`;
    if (b.frequency==='weekly') return `$${b.amount}/wk`;
    return `$${b.amount}/mo`;
  };

  const getDueStatus = (dueDay) => {
    const diff = Number(dueDay) - today;
    if (diff < 0) return { label:'Paid', cls:'paid' };
    if (diff === 0) return { label:'Due today', cls:'today' };
    if (diff <= 3) return { label:`Due in ${diff}d`, cls:'soon' };
    return { label:`Due ${dueDay}${ordinal(Number(dueDay))}`, cls:'ok' };
  };

  const ordinal = n => { const s=['th','st','nd','rd']; const v=n%100; return s[(v-20)%10]||s[v]||s[0]; };

  return (
    <div className="bills-page">
      {confirmDelete && (
        <div className="modal-overlay" onClick={()=>setConfirmDelete(null)}>
          <div className="confirm-modal" onClick={e=>e.stopPropagation()}>
            <div className="confirm-icon">🗑</div>
            <div className="confirm-title">Remove Bill?</div>
            <div className="confirm-body"><strong>{confirmDelete.description}</strong></div>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={()=>setConfirmDelete(null)}>Cancel</button>
              <button className="confirm-delete" onClick={handleDeleteConfirm}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Bills</h1>
          <p className="page-subtitle">Track and manage your recurring payments</p>
        </div>
        <button className="btn-add" onClick={()=>setShowForm(v=>!v)}>
          {showForm?'✕ Cancel':'+ Add Bill'}
        </button>
      </div>

      {/* Summary */}
      <div className="bills-summary">
        <div className="bs-card">
          <div className="bs-label">Monthly Total</div>
          <div className="bs-val accent">${totalMonthly.toFixed(0)}</div>
        </div>
        <div className="bs-card">
          <div className="bs-label">Annual Total</div>
          <div className="bs-val">${(totalMonthly*12).toFixed(0)}</div>
        </div>
        <div className="bs-card">
          <div className="bs-label">Active Bills</div>
          <div className="bs-val">{bills.length}</div>
        </div>
        {upcomingBills.length > 0 && (
          <div className="bs-card upcoming">
            <div className="bs-label">⏰ Coming up in 10 days</div>
            <div className="bs-val red">{upcomingBills.length} bill{upcomingBills.length>1?'s':''}</div>
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bills-form-card">
          <div className="form-title">Add Recurring Bill</div>
          <div className="bills-form-grid">
            <div className={`form-group ${errors.description?'has-error':''}`}>
              <label>Bill Name</label>
              <input className="ob-input" type="text" placeholder="Netflix, Rent, Gym..."
                value={form.description} onChange={e=>{setForm(f=>({...f,description:e.target.value}));setErrors(er=>({...er,description:undefined}));}} />
              {errors.description && <span className="field-error">{errors.description}</span>}
            </div>
            <div className={`form-group ${errors.amount?'has-error':''}`}>
              <label>Amount</label>
              <div className="curr-wrap">
                <span className="curr-sign">$</span>
                <input type="number" className="curr-input" placeholder="0.00" min="0.01"
                  value={form.amount} onChange={e=>{setForm(f=>({...f,amount:e.target.value}));setErrors(er=>({...er,amount:undefined}));}} />
              </div>
              {errors.amount && <span className="field-error">{errors.amount}</span>}
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="ob-input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {BILL_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Frequency</label>
              <select className="ob-input" value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="form-group">
              <label>Due Day of Month</label>
              <select className="ob-input" value={form.dueDay} onChange={e=>setForm(f=>({...f,dueDay:e.target.value}))}>
                {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}{ordinal(d)}</option>)}
              </select>
            </div>
          </div>
          <button className="btn-submit" onClick={handleAdd}>Add Bill</button>
        </div>
      )}

      {/* Bills list */}
      {bills.length === 0 ? (
        <div className="bills-empty">
          <div className="be-icon">📋</div>
          <h3>No bills tracked yet</h3>
          <p>Add your recurring bills — rent, subscriptions, insurance — and never lose track of what's due.</p>
        </div>
      ) : (
        <div className="bills-list">
          {bills.map(b=>{
            const cat = getCat(b.category);
            const status = getDueStatus(b.dueDay||1);
            return (
              <div key={b.id} className="bill-row">
                <div className="br-icon" style={{background:`${cat.color}18`}}>{cat.icon}</div>
                <div className="br-info">
                  <div className="br-name">{b.description}</div>
                  <div className="br-cat">{cat.label}</div>
                </div>
                <div className="br-freq">{fmtFreq(b)}</div>
                <div className={`br-due ${status.cls}`}>{status.label}</div>
                <button className="delete-btn" onClick={()=>setConfirmDelete(b)}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
