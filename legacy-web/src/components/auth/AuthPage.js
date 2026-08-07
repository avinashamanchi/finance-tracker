import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import './AuthPage.css';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]       = useState('signin');
  const [form, setForm]       = useState({ name:'', email:'', password:'', confirm:'' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const set = (k,v) => { setForm(f=>({...f,[k]:v})); setError(''); };

  const validate = () => {
    if (!form.email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email.';
    if (!form.password) return 'Password is required.';
    if (mode === 'signup') {
      if (!form.name.trim()) return 'Name is required.';
      if (form.password.length < 6) return 'Password must be at least 6 characters.';
      if (form.password !== form.confirm) return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    await new Promise(r=>setTimeout(r,400));
    const result = mode==='signup'
      ? signUp(form.name, form.email, form.password)
      : signIn(form.email, form.password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  const switchMode = (m) => { setMode(m); setError(''); setForm({name:'',email:'',password:'',confirm:''}); };

  return (
    <div className="auth-bg">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">◈</span>
          <span className="auth-logo-text">Finova</span>
        </div>
        <p className="auth-tagline">Smart money management</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode==='signin'?'active':''}`} onClick={()=>switchMode('signin')}>Sign In</button>
          <button className={`auth-tab ${mode==='signup'?'active':''}`} onClick={()=>switchMode('signup')}>Create Account</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode==='signup' && (
            <div className="auth-field">
              <label>Full Name</label>
              <input type="text" placeholder="Your name" value={form.name}
                onChange={e=>set('name',e.target.value)} autoComplete="name" />
            </div>
          )}
          <div className="auth-field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" value={form.email}
              onChange={e=>set('email',e.target.value)} autoComplete="email" />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <div className="pass-wrap">
              <input type={showPass?'text':'password'}
                placeholder={mode==='signup'?'Min. 6 characters':'••••••••'}
                value={form.password} onChange={e=>set('password',e.target.value)}
                autoComplete={mode==='signup'?'new-password':'current-password'} />
              <button type="button" className="pass-toggle" onClick={()=>setShowPass(v=>!v)}>
                {showPass?'🙈':'👁'}
              </button>
            </div>
          </div>
          {mode==='signup' && (
            <div className="auth-field">
              <label>Confirm Password</label>
              <input type={showPass?'text':'password'} placeholder="Re-enter password"
                value={form.confirm} onChange={e=>set('confirm',e.target.value)} autoComplete="new-password" />
            </div>
          )}
          {error && <div className="auth-error"><span>⚠</span> {error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : mode==='signin'?'Sign In':'Create Account'}
          </button>
        </form>

        <div className="auth-switch">
          {mode==='signin'
            ? <>No account? <button className="auth-link" onClick={()=>switchMode('signup')}>Sign up free</button></>
            : <>Have an account? <button className="auth-link" onClick={()=>switchMode('signin')}>Sign in</button></>
          }
        </div>
        <div className="auth-privacy">🔒 Data stored locally on your device</div>
      </div>
    </div>
  );
}
