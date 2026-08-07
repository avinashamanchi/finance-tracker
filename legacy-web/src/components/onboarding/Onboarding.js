import React, { useState } from 'react';
import { CATEGORIES, getCat } from '../../hooks/useFinance';
import { format, subMonths } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import './Onboarding.css';

const STEPS = [
  { id:'welcome',   title:'Welcome to Finova',      subtitle:'Your personal finance command center' },
  { id:'profile',   title:"Let's get to know you",  subtitle:'This helps us personalize your experience' },
  { id:'income',    title:'What do you earn?',       subtitle:'Enter your monthly take-home income' },
  { id:'housing',   title:'Housing & Utilities',     subtitle:'Your biggest fixed expenses' },
  { id:'bills',     title:'Regular Bills',           subtitle:'Subscriptions, insurance, and recurring costs' },
  { id:'lifestyle', title:'Day-to-Day Spending',     subtitle:'Food, transport, shopping, and fun' },
  { id:'goals',     title:'What are your goals?',    subtitle:'What do you want to achieve?' },
  { id:'review',    title:'Your Financial Blueprint', subtitle:'Here\'s your personalized budget' },
];

const GOALS = [
  { id:'payoff_debt',  icon:'💳', label:'Pay off debt' },
  { id:'emergency',    icon:'🛡', label:'Build emergency fund' },
  { id:'save_home',    icon:'🏠', label:'Save for a home' },
  { id:'retirement',   icon:'🌴', label:'Retire early' },
  { id:'invest',       icon:'📈', label:'Grow investments' },
  { id:'travel',       icon:'✈️', label:'Save for travel' },
  { id:'car',          icon:'🚗', label:'Buy a car' },
  { id:'education',    icon:'🎓', label:'Education fund' },
];

function CurrencyInput({ value, onChange, placeholder='0', label, sublabel }) {
  return (
    <div className="curr-group">
      {label && <div className="curr-label">{label}</div>}
      {sublabel && <div className="curr-sublabel">{sublabel}</div>}
      <div className="curr-wrap">
        <span className="curr-sign">$</span>
        <input
          type="number" min="0" step="1"
          className="curr-input"
          value={value||''}
          placeholder={placeholder}
          onChange={e=>onChange(e.target.value===''?0:Number(e.target.value))}
        />
        <span className="curr-freq">/mo</span>
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete, userName }) {
  const [step, setStep] = useState(0);
  const [anim, setAnim]  = useState('in');

  // Profile
  const [profile, setProfile] = useState({
    firstName: userName?.split(' ')[0] || '',
    housing: 'rent', // rent | own | family
    household: '1',  // 1,2,3,4,5+
    state: '',
  });

  // Income sources
  const [incomes, setIncomes] = useState([
    { id:'salary', amount:0, label:'Primary Salary', icon:'💼', color:'#00d4aa' },
  ]);
  const [extraIncome, setExtraIncome] = useState([]);

  // Housing
  const [housing, setHousing] = useState({ rent:0, electric:0, gas:0, water:0, internet:0, phone:0 });

  // Bills
  const [bills, setBills] = useState({
    health_insurance:0, car_insurance:0, life_insurance:0,
    netflix:0, spotify:0, gym:0, other_subs:0, car_payment:0, student_loan:0,
  });

  // Lifestyle
  const [lifestyle, setLifestyle] = useState({
    groceries:0, dining:0, transport_gas:0, transport_other:0,
    shopping:0, entertainment:0, personal:0, kids:0, pets:0,
  });

  // Goals
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [savingsGoal, setSavingsGoal] = useState(10); // % of income

  const go = (dir) => {
    setAnim('out');
    setTimeout(() => {
      setStep(s => s + dir);
      setAnim('in');
    }, 200);
  };

  const toggleGoal = (id) => {
    setSelectedGoals(prev => prev.includes(id) ? prev.filter(g=>g!==id) : [...prev, id]);
  };

  const addExtraIncome = () => {
    setExtraIncome(prev=>[...prev,{ id:uuidv4(), amount:0, source:'freelance', label:'Side Income' }]);
  };

  const totalMonthlyIncome = incomes.reduce((s,i)=>s+i.amount,0) + extraIncome.reduce((s,i)=>s+i.amount,0);

  const budgetFromAnswers = () => {
    return {
      rent:   housing.rent,
      utilities: housing.electric + housing.gas + housing.water,
      subscriptions: housing.phone + bills.netflix + bills.spotify + bills.gym + bills.other_subs,
      insurance: bills.health_insurance + bills.car_insurance + bills.life_insurance,
      groceries: lifestyle.groceries,
      dining:    lifestyle.dining,
      transport: lifestyle.transport_gas + lifestyle.transport_other + bills.car_payment,
      health:    80,
      shopping:  lifestyle.shopping,
      entertainment: lifestyle.entertainment,
      personal:  lifestyle.personal,
      kids:      lifestyle.kids,
      pets:      lifestyle.pets,
      travel:    50,
      gifts_out: 30,
      savings:   Math.round(totalMonthlyIncome * savingsGoal / 100),
      education: bills.student_loan,
      other_ex:  100,
    };
  };

  const handleFinish = () => {
    const budgets = budgetFromAnswers();
    const profileData = {
      ...profile,
      goals: selectedGoals,
      savingsGoalPct: savingsGoal,
      totalIncome: totalMonthlyIncome,
      incomes: [...incomes, ...extraIncome],
    };
    onComplete(profileData, budgets, []);
  };

  const totalFixed = housing.rent + housing.electric + housing.gas + housing.water +
    housing.internet + housing.phone + bills.health_insurance + bills.car_insurance +
    bills.life_insurance + bills.netflix + bills.spotify + bills.gym + bills.other_subs +
    bills.car_payment + bills.student_loan;

  const totalVar = lifestyle.groceries + lifestyle.dining + lifestyle.transport_gas +
    lifestyle.transport_other + lifestyle.shopping + lifestyle.entertainment +
    lifestyle.personal + lifestyle.kids + lifestyle.pets;

  const totalExpenses = totalFixed + totalVar;
  const surplus = totalMonthlyIncome - totalExpenses;
  const suggestedSavings = totalMonthlyIncome > 0 ? Math.max(0, Math.round((surplus * 0.5) / totalMonthlyIncome * 100)) : 10;

  const stepData = STEPS[step];
  const progress = (step / (STEPS.length - 1)) * 100;

  const canNext = () => {
    if (step===1) return profile.firstName.trim().length > 0;
    if (step===2) return totalMonthlyIncome > 0;
    return true;
  };

  return (
    <div className="onboarding-bg">
      <div className="ob-orb ob-orb-1" />
      <div className="ob-orb ob-orb-2" />
      <div className="ob-orb ob-orb-3" />

      <div className="ob-shell">
        {/* Progress bar */}
        {step > 0 && (
          <div className="ob-progress-bar">
            <div className="ob-progress-fill" style={{ width:`${progress}%` }} />
          </div>
        )}

        {/* Step counter */}
        {step > 0 && step < STEPS.length - 1 && (
          <div className="ob-step-count">
            Step {step} of {STEPS.length - 2}
          </div>
        )}

        <div className={`ob-content anim-${anim}`}>

          {/* ── STEP 0: Welcome ── */}
          {step === 0 && (
            <div className="ob-step ob-welcome">
              <div className="ob-logo-big">
                <span className="ob-logo-icon">◈</span>
                <span className="ob-logo-text">Finova</span>
              </div>
              <h1 className="ob-welcome-title">
                Take control of<br/><span className="ob-highlight">your money</span>
              </h1>
              <p className="ob-welcome-sub">
                Finova tracks your spending, helps you budget smarter,<br/>
                and shows exactly where every dollar goes — like Rocket Money,<br/>
                but built just for you.
              </p>
              <div className="ob-feature-pills">
                {['📊 Spending insights','🎯 Budget goals','📋 Bill tracking','📈 Net worth','🔔 Budget alerts','💡 Smart tips'].map(f=>(
                  <span key={f} className="ob-pill">{f}</span>
                ))}
              </div>
              <button className="ob-btn-primary ob-btn-xl" onClick={()=>go(1)}>
                Get Started — It's Free →
              </button>
              <p className="ob-privacy-note">🔒 All data stored locally on your device. Never shared.</p>
            </div>
          )}

          {/* ── STEP 1: Profile ── */}
          {step === 1 && (
            <div className="ob-step">
              <div className="ob-step-icon">👋</div>
              <h2 className="ob-title">{stepData.title}</h2>
              <p className="ob-sub">{stepData.subtitle}</p>
              <div className="ob-form">
                <div className="ob-field">
                  <label>First name</label>
                  <input type="text" placeholder="Avi"
                    value={profile.firstName}
                    onChange={e=>setProfile(p=>({...p,firstName:e.target.value}))}
                    className="ob-input" autoFocus
                  />
                </div>
                <div className="ob-field">
                  <label>Housing situation</label>
                  <div className="ob-radio-group">
                    {[{v:'rent',l:'I rent',i:'🔑'},{v:'own',l:'I own',i:'🏡'},{v:'family',l:'Live with family',i:'👨‍👩‍👧'}].map(o=>(
                      <button key={o.v}
                        className={`ob-radio ${profile.housing===o.v?'active':''}`}
                        onClick={()=>setProfile(p=>({...p,housing:o.v}))}>
                        <span>{o.i}</span><span>{o.l}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ob-field">
                  <label>Household size</label>
                  <div className="ob-radio-group ob-radio-sm">
                    {['1','2','3','4','5+'].map(n=>(
                      <button key={n}
                        className={`ob-radio ${profile.household===n?'active':''}`}
                        onClick={()=>setProfile(p=>({...p,household:n}))}>
                        {n === '1' ? '🧑' : n === '2' ? '👫' : n === '3' ? '👨‍👩‍👦' : n === '4' ? '👨‍👩‍👧‍👦' : '👨‍👩‍👧‍👦+'} {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Income ── */}
          {step === 2 && (
            <div className="ob-step">
              <div className="ob-step-icon">💵</div>
              <h2 className="ob-title">{stepData.title}</h2>
              <p className="ob-sub">{stepData.subtitle}</p>
              <div className="ob-income-list">
                {incomes.map((inc,i) => (
                  <div key={inc.id} className="ob-income-item">
                    <div className="ob-income-label">
                      <span>{inc.icon}</span>
                      <span>{inc.label}</span>
                    </div>
                    <CurrencyInput value={inc.amount}
                      onChange={v=>setIncomes(prev=>prev.map((x,j)=>j===i?{...x,amount:v}:x))} />
                  </div>
                ))}
                {extraIncome.map((inc,i) => (
                  <div key={inc.id} className="ob-income-item">
                    <div className="ob-income-label">
                      <span>💸</span>
                      <input className="ob-input-inline"
                        value={inc.label}
                        onChange={e=>setExtraIncome(prev=>prev.map((x,j)=>j===i?{...x,label:e.target.value}:x))}
                        placeholder="Income source name"
                      />
                    </div>
                    <CurrencyInput value={inc.amount}
                      onChange={v=>setExtraIncome(prev=>prev.map((x,j)=>j===i?{...x,amount:v}:x))} />
                  </div>
                ))}
              </div>
              <button className="ob-btn-ghost" onClick={addExtraIncome}>+ Add another income source</button>
              {totalMonthlyIncome > 0 && (
                <div className="ob-income-total">
                  Total monthly income: <strong>${totalMonthlyIncome.toLocaleString()}</strong>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Housing ── */}
          {step === 3 && (
            <div className="ob-step">
              <div className="ob-step-icon">🏠</div>
              <h2 className="ob-title">{stepData.title}</h2>
              <p className="ob-sub">{stepData.subtitle}</p>
              <div className="ob-grid-2">
                <CurrencyInput label={profile.housing==='rent'?'Monthly Rent':'Mortgage Payment'} value={housing.rent} onChange={v=>setHousing(h=>({...h,rent:v}))} />
                <CurrencyInput label="Electricity" value={housing.electric} onChange={v=>setHousing(h=>({...h,electric:v}))} />
                <CurrencyInput label="Gas / Heating" value={housing.gas} onChange={v=>setHousing(h=>({...h,gas:v}))} />
                <CurrencyInput label="Water / Trash" value={housing.water} onChange={v=>setHousing(h=>({...h,water:v}))} />
                <CurrencyInput label="Internet" value={housing.internet} onChange={v=>setHousing(h=>({...h,internet:v}))} />
                <CurrencyInput label="Cell Phone" value={housing.phone} onChange={v=>setHousing(h=>({...h,phone:v}))} />
              </div>
              {totalFixed > 0 && (
                <div className="ob-subtotal">Housing & utilities: <strong>${totalFixed.toLocaleString()}/mo</strong></div>
              )}
            </div>
          )}

          {/* ── STEP 4: Bills ── */}
          {step === 4 && (
            <div className="ob-step">
              <div className="ob-step-icon">📋</div>
              <h2 className="ob-title">{stepData.title}</h2>
              <p className="ob-sub">{stepData.subtitle}</p>
              <div className="ob-section-label">Insurance</div>
              <div className="ob-grid-2">
                <CurrencyInput label="Health Insurance" value={bills.health_insurance} onChange={v=>setBills(b=>({...b,health_insurance:v}))} />
                <CurrencyInput label="Car Insurance" value={bills.car_insurance} onChange={v=>setBills(b=>({...b,car_insurance:v}))} />
                <CurrencyInput label="Life Insurance" value={bills.life_insurance} onChange={v=>setBills(b=>({...b,life_insurance:v}))} />
              </div>
              <div className="ob-section-label">Subscriptions</div>
              <div className="ob-grid-2">
                <CurrencyInput label="Streaming (Netflix/Hulu…)" value={bills.netflix} onChange={v=>setBills(b=>({...b,netflix:v}))} />
                <CurrencyInput label="Music (Spotify/Apple…)" value={bills.spotify} onChange={v=>setBills(b=>({...b,spotify:v}))} />
                <CurrencyInput label="Gym / Fitness" value={bills.gym} onChange={v=>setBills(b=>({...b,gym:v}))} />
                <CurrencyInput label="Other Subscriptions" value={bills.other_subs} onChange={v=>setBills(b=>({...b,other_subs:v}))} />
              </div>
              <div className="ob-section-label">Debt Payments</div>
              <div className="ob-grid-2">
                <CurrencyInput label="Car Payment" value={bills.car_payment} onChange={v=>setBills(b=>({...b,car_payment:v}))} />
                <CurrencyInput label="Student Loans" value={bills.student_loan} onChange={v=>setBills(b=>({...b,student_loan:v}))} />
              </div>
            </div>
          )}

          {/* ── STEP 5: Lifestyle ── */}
          {step === 5 && (
            <div className="ob-step">
              <div className="ob-step-icon">🛒</div>
              <h2 className="ob-title">{stepData.title}</h2>
              <p className="ob-sub">{stepData.subtitle}</p>
              <div className="ob-grid-2">
                <CurrencyInput label="Groceries" value={lifestyle.groceries} onChange={v=>setLifestyle(l=>({...l,groceries:v}))} />
                <CurrencyInput label="Dining Out / Takeout" value={lifestyle.dining} onChange={v=>setLifestyle(l=>({...l,dining:v}))} />
                <CurrencyInput label="Gas / Fuel" value={lifestyle.transport_gas} onChange={v=>setLifestyle(l=>({...l,transport_gas:v}))} />
                <CurrencyInput label="Uber / Transit" value={lifestyle.transport_other} onChange={v=>setLifestyle(l=>({...l,transport_other:v}))} />
                <CurrencyInput label="Shopping / Clothing" value={lifestyle.shopping} onChange={v=>setLifestyle(l=>({...l,shopping:v}))} />
                <CurrencyInput label="Entertainment" value={lifestyle.entertainment} onChange={v=>setLifestyle(l=>({...l,entertainment:v}))} />
                <CurrencyInput label="Personal Care" value={lifestyle.personal} onChange={v=>setLifestyle(l=>({...l,personal:v}))} />
                <CurrencyInput label="Kids / Family" value={lifestyle.kids} onChange={v=>setLifestyle(l=>({...l,kids:v}))} />
                <CurrencyInput label="Pets" value={lifestyle.pets} onChange={v=>setLifestyle(l=>({...l,pets:v}))} />
              </div>
            </div>
          )}

          {/* ── STEP 6: Goals ── */}
          {step === 6 && (
            <div className="ob-step">
              <div className="ob-step-icon">🎯</div>
              <h2 className="ob-title">{stepData.title}</h2>
              <p className="ob-sub">{stepData.subtitle}</p>
              <div className="ob-goals-grid">
                {GOALS.map(g=>(
                  <button key={g.id}
                    className={`ob-goal-card ${selectedGoals.includes(g.id)?'active':''}`}
                    onClick={()=>toggleGoal(g.id)}>
                    <span className="ob-goal-icon">{g.icon}</span>
                    <span className="ob-goal-label">{g.label}</span>
                    {selectedGoals.includes(g.id) && <span className="ob-goal-check">✓</span>}
                  </button>
                ))}
              </div>
              <div className="ob-savings-slider">
                <div className="ob-slider-header">
                  <span>Monthly savings goal</span>
                  <strong className="ob-accent">{savingsGoal}% of income</strong>
                </div>
                {totalMonthlyIncome > 0 && (
                  <div className="ob-slider-amount">= ${Math.round(totalMonthlyIncome*savingsGoal/100).toLocaleString()}/mo</div>
                )}
                <input type="range" min="0" max="50" step="1"
                  className="ob-slider"
                  value={savingsGoal}
                  onChange={e=>setSavingsGoal(Number(e.target.value))}
                />
                <div className="ob-slider-labels"><span>0%</span><span>10%</span><span>20%</span><span>30%</span><span>50%</span></div>
              </div>
              {surplus < 0 && totalMonthlyIncome > 0 && (
                <div className="ob-warning-box">
                  ⚠️ Your estimated expenses (${totalExpenses.toLocaleString()}) exceed your income (${totalMonthlyIncome.toLocaleString()}).
                  Consider reviewing your budget or finding ways to reduce spending.
                </div>
              )}
            </div>
          )}

          {/* ── STEP 7: Review ── */}
          {step === 7 && (
            <div className="ob-step ob-review">
              <div className="ob-step-icon">🎉</div>
              <h2 className="ob-title">Your Blueprint is Ready, {profile.firstName}!</h2>
              <p className="ob-sub">Here's your personalized monthly budget</p>

              <div className="ob-summary-cards">
                <div className="ob-sum-card income">
                  <div className="ob-sum-label">Monthly Income</div>
                  <div className="ob-sum-val">${totalMonthlyIncome.toLocaleString()}</div>
                </div>
                <div className="ob-sum-card expenses">
                  <div className="ob-sum-label">Budgeted Expenses</div>
                  <div className="ob-sum-val">${totalExpenses.toLocaleString()}</div>
                </div>
                <div className={`ob-sum-card ${surplus>=0?'savings':'deficit'}`}>
                  <div className="ob-sum-label">{surplus>=0?'Available to Save':'Monthly Deficit'}</div>
                  <div className="ob-sum-val">{surplus>=0?'+':''} ${Math.abs(surplus).toLocaleString()}</div>
                </div>
              </div>

              <div className="ob-budget-preview">
                <div className="ob-bp-title">Budget Breakdown</div>
                {[
                  { label:'Housing & Utilities', amt: housing.rent+housing.electric+housing.gas+housing.water+housing.internet+housing.phone, icon:'🏠', color:'#f59e0b' },
                  { label:'Bills & Insurance',   amt: bills.health_insurance+bills.car_insurance+bills.life_insurance+bills.netflix+bills.spotify+bills.gym+bills.other_subs+bills.car_payment+bills.student_loan, icon:'📋', color:'#8b5cf6' },
                  { label:'Food & Dining',        amt: lifestyle.groceries+lifestyle.dining, icon:'🍽', color:'#f97316' },
                  { label:'Transport',            amt: lifestyle.transport_gas+lifestyle.transport_other, icon:'🚗', color:'#60a5fa' },
                  { label:'Lifestyle',            amt: lifestyle.shopping+lifestyle.entertainment+lifestyle.personal+lifestyle.kids+lifestyle.pets, icon:'🛍', color:'#ec4899' },
                  { label:'Savings Goal',         amt: Math.round(totalMonthlyIncome*savingsGoal/100), icon:'💰', color:'#00d4aa' },
                ].filter(r=>r.amt>0).map(r=>(
                  <div key={r.label} className="ob-bp-row">
                    <div className="ob-bp-left">
                      <span className="ob-bp-icon" style={{background:`${r.color}18`}}>{r.icon}</span>
                      <span className="ob-bp-label">{r.label}</span>
                    </div>
                    <div className="ob-bp-right">
                      <div className="ob-bp-bar-track">
                        <div className="ob-bp-bar-fill" style={{
                          width: totalMonthlyIncome>0 ? `${Math.min((r.amt/totalMonthlyIncome)*100,100)}%` : '0%',
                          background: r.color
                        }} />
                      </div>
                      <span className="ob-bp-amt" style={{color:r.color}}>${r.amt.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedGoals.length > 0 && (
                <div className="ob-goals-chips">
                  <span className="ob-goals-label">Your goals:</span>
                  {selectedGoals.map(gid=>{
                    const g = GOALS.find(x=>x.id===gid);
                    return g ? <span key={gid} className="ob-goal-chip">{g.icon} {g.label}</span> : null;
                  })}
                </div>
              )}

              <button className="ob-btn-primary ob-btn-xl ob-btn-full" onClick={handleFinish}>
                Launch My Dashboard →
              </button>
            </div>
          )}

        </div>

        {/* Navigation */}
        {step > 0 && step < STEPS.length - 1 && (
          <div className="ob-nav">
            <button className="ob-btn-ghost ob-btn-back" onClick={()=>go(-1)}>← Back</button>
            <button
              className={`ob-btn-primary ${!canNext()?'ob-btn-disabled':''}`}
              onClick={()=>canNext()&&go(1)}
              disabled={!canNext()}
            >
              {step === STEPS.length - 2 ? 'Review My Budget →' : 'Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
