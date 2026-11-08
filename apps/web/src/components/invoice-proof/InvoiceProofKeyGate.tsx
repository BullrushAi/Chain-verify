'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { clearStoredKey, readStoredKey, writeStoredKey } from '@/lib/invoice-proof/api-key-store';
import { fetchCustomerMe, signOutCustomer } from '@/lib/customerAuth';

import { InvoiceProofSessionContext } from './useInvoiceProofSession';

export interface InvoiceProofKeyGateProps {
  children: ReactNode;
}

/**
 * The dashboard front door (Task 1): an email session (httpOnly cookie, checked
 * first) signs the customer in, and the API-key form stays as the fallback for
 * API users. A key is held in sessionStorage only (cleared when the tab closes).
 * Pages below the gate read the session via useInvoiceProofSession(). A credential
 * the API rejects is cleared by the page that detects the 401 through signOut(reason).
 */
export function InvoiceProofKeyGate({ children }: InvoiceProofKeyGateProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCustomerMe()
      .then((me) => {
        if (!cancelled && me) setEmail(me.email);
      })
      .catch(() => {
        /* no email session; fall through to the API-key check */
      })
      .finally(() => {
        if (!cancelled) {
          setApiKey(readStoredKey());
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(
    (reason?: string) => {
      if (email) {
        void signOutCustomer().catch(() => {
          /* the cookie is cleared regardless */
        });
        setEmail(null);
      }
      clearStoredKey();
      setApiKey(null);
      setInput('');
      setNotice(reason ?? null);
    },
    [email],
  );

  const session = useMemo(() => {
    if (apiKey) return { apiKey, authKind: 'api-key' as const, signOut };
    if (email) return { apiKey: '', email, authKind: 'email' as const, signOut };
    return null;
  }, [apiKey, email, signOut]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const candidate = input.trim();
    if (!candidate) return;
    writeStoredKey(candidate);
    setNotice(null);
    setApiKey(candidate);
  }

  if (!ready) return null;
  if (session) {
    return (
      <InvoiceProofSessionContext.Provider value={session}>{children}</InvoiceProofSessionContext.Provider>
    );
  }

  return (
    <div className="ipa-gate">
      <div className="ipa-card ipa-gate-card" aria-labelledby="ipa-gate-title">
        <h1 id="ipa-gate-title">Sign in to ChainVerify</h1>
        <p className="ipa-sub">
          Sign in with the email for your account — we will send you a one-time code. No password needed.
        </p>
        <Link className="ipa-btn ipa-btn-primary" href="/login">
          Sign in with email
        </Link>
        <p className="ipa-faint">
          No account yet? <Link className="ipa-link" href="/signup">Create one</Link>.
        </p>
      </div>
      <form className="ipa-card ipa-gate-card" onSubmit={handleSubmit} aria-labelledby="ipa-gate-key-title">
        <h2 id="ipa-gate-key-title">Or continue with an API key</h2>
        <p className="ipa-sub">
          Enter the Chain Verify API key issued for your organization. It is kept in this browser tab
          only and is cleared when you close the tab.
        </p>
        <div className="ipa-field">
          <label className="ipa-label" htmlFor="ipa-api-key">
            API key
          </label>
          <input
            id="ipa-api-key"
            className="ipa-input"
            type="password"
            autoComplete="off"
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste your API key"
          />
        </div>
        {notice ? (
          <p className="ipa-alert ipa-alert-error" role="alert">
            {notice}
          </p>
        ) : null}
        <button type="submit" className="ipa-btn ipa-btn-primary" disabled={!input.trim()}>
          Continue
        </button>
        <p className="ipa-faint">
          No key yet? Start an InvoiceProof pilot from the <Link className="ipa-link" href="/invoice-proof#plans">plans section</Link>.
        </p>
      </form>
    </div>
  );
}
