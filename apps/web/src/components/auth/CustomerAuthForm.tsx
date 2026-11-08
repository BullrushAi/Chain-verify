'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { CustomerAuthError, requestLoginCode, verifyLoginCode } from '@/lib/customerAuth';

export interface CustomerAuthFormProps {
  mode: 'login' | 'signup';
}

/**
 * Email sign-up / sign-in (Task 1). No passwords: the customer enters an
 * email, receives a 6-digit code, enters the code, and is signed in with a
 * 30-day session cookie. Sign-up and login are the same flow — a first-time
 * email creates the account on successful verify.
 */
export function CustomerAuthForm({ mode }: CustomerAuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await requestLoginCode(email.trim());
      setNotice(result.message);
      setStep('code');
    } catch (e: any) {
      setError(e instanceof CustomerAuthError ? e.message : 'We could not send a code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyLoginCode(email.trim(), code.trim());
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) {
      setError(e instanceof CustomerAuthError ? e.message : 'That code is not valid. Request a new code and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(null);
    setBusy(true);
    try {
      const result = await requestLoginCode(email.trim());
      setNotice(result.message);
    } catch (e: any) {
      setError(e instanceof CustomerAuthError ? e.message : 'We could not send a code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ipa-gate">
      <div className="ipa-card ipa-gate-card" aria-labelledby="cv-auth-title">
        <h1 id="cv-auth-title">{isSignup ? 'Create your ChainVerify account' : 'Sign in to ChainVerify'}</h1>
        <p className="ipa-sub">
          {isSignup
            ? 'Enter your email and we will send you a one-time sign-in code. No password to remember. If you bought with this email, your organization is connected automatically.'
            : 'Enter the email for your account and we will send you a one-time sign-in code. No password needed.'}
        </p>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="ipa-field">
              <label className="ipa-label" htmlFor="cv-auth-email">Email</label>
              <input
                id="cv-auth-email"
                className="ipa-input"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </div>
            {error ? <p className="ipa-alert ipa-alert-error" role="alert">{error}</p> : null}
            <button type="submit" className="ipa-btn ipa-btn-primary" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit}>
            <div className="ipa-field">
              <label className="ipa-label" htmlFor="cv-auth-code">Sign-in code</label>
              <input
                id="cv-auth-code"
                className="ipa-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="6-digit code"
              />
            </div>
            {notice ? <p className="ipa-alert" role="status">{notice}</p> : null}
            {error ? <p className="ipa-alert ipa-alert-error" role="alert">{error}</p> : null}
            <button type="submit" className="ipa-btn ipa-btn-primary" disabled={busy || code.trim().length !== 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="ipa-faint">
              Code sent to {email}.{' '}
              <button type="button" className="ipa-link" onClick={() => void handleResend()} disabled={busy}>
                Send a new code
              </button>
              {' '}·{' '}
              <button type="button" className="ipa-link" onClick={() => { setStep('email'); setCode(''); setError(null); }}>
                Use a different email
              </button>
            </p>
          </form>
        )}

        <p className="ipa-faint">
          {isSignup ? (
            <>Already have an account? <Link className="ipa-link" href="/login">Sign in</Link>.</>
          ) : (
            <>No account yet? <Link className="ipa-link" href="/signup">Create one</Link>.</>
          )}
          {' '}Developers can still sign in with an <Link className="ipa-link" href="/dashboard">API key</Link> instead.
        </p>
      </div>
    </div>
  );
}
