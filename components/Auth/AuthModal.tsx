"use client";
import React, { useState, useEffect } from 'react';
import supabase from '../../lib/supabaseClient';

type Props = { open: boolean; onClose: () => void; initialMode?: 'signin' | 'signup' };

export default function AuthModal({ open, onClose, initialMode = 'signin' }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  // Reset mode when `open` or `initialMode` changes
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        // create account
        const redirectUrl = process.env.NEXT_PUBLIC_SITE_URL || undefined;
        const signUpPayload = redirectUrl
          ? { email, password, options: { emailRedirectTo: redirectUrl } }
          : { email, password };
        const { data: suData, error: suErr } = await supabase.auth.signUp(signUpPayload as any);
        if (suErr) {
          throw suErr;
        }

        // attempt sign in to obtain a session (works if email confirmations are disabled)
        const { data: inData, error: inErr } = await supabase.auth.signInWithPassword({ email, password });
        if (inErr) {
          const msg = (inErr?.message || String(inErr || '')).toString();
          if (/confirm|verification|verify|confirmed|confirmation/i.test(msg)) {
            setInfo('Account created — please confirm your email (or enable instant sign-in in Supabase settings).');
            return;
          }
          throw inErr;
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      // success
      setEmail(''); setPassword('');
      onClose();
    } catch (err: any) {
      // network vs API errors
      const msg = err?.message || String(err || 'An error occurred');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`overlay open`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">{mode === 'signup' ? 'Create account' : 'Sign in'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </div>

          {info ? <div className="empty" style={{border:'none', background:'transparent', color:'var(--muted)', marginBottom:12}}>{info}</div> : null}
          {error ? <div className="empty" style={{border:'none', background:'transparent', color:'var(--red)', marginBottom:12}}>{error}</div> : null}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </div>
        </form>

        <div className="auth-toggle">
          {mode === 'signup' ? (
            <span>Already have an account? <button type="button" className="view-link" onClick={() => setMode('signin')} aria-label="Switch to sign in">Sign in</button></span>
          ) : (
            <span>Don't have an account? <button type="button" className="view-link" onClick={() => setMode('signup')} aria-label="Switch to create account">Create one</button></span>
          )}
        </div>
      </div>
    </div>
  );
}
