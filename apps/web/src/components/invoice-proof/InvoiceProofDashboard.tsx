'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage, InvoiceProofApiError, invoiceProofApi } from '@/lib/invoice-proof/client';
import type { InvoiceProofUsage, ProofRecordSummary, ScanSummary } from '@/lib/invoice-proof/types';

import { DashboardStats } from './DashboardStats';
import { ProofRecordsTable } from './ProofRecordsTable';
import { ScanHistoryTable } from './ScanHistoryTable';
import { UsageMeter } from './UsageMeter';
import { useInvoiceProofSession } from './useInvoiceProofSession';

export function InvoiceProofDashboard() {
  const { apiKey, authKind, signOut } = useInvoiceProofSession();
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [usage, setUsage] = useState<InvoiceProofUsage | null>(null);
  const [proofs, setProofs] = useState<ProofRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextScans, nextUsage, nextProofs] = await Promise.all([
        invoiceProofApi.listScans(apiKey),
        invoiceProofApi.getUsage(apiKey).catch(() => null),
        invoiceProofApi.listProofRecords(apiKey).catch(() => [] as ProofRecordSummary[]),
      ]);
      setScans(nextScans);
      setUsage(nextUsage);
      setProofs(nextProofs);
    } catch (err) {
      if (err instanceof InvoiceProofApiError && (err.status === 401 || err.status === 403)) {
        // This dashboard takes an API key only. An email session has no
        // key (apiKey is ''), so a 401/403 here says nothing about the
        // email session — it must NOT sign the user out. The gate's signOut
        // posts /api/auth/logout, which deletes every session: that is how
        // merely opening this page from the dashboard destroyed the
        // dashboard email session live (CBV fix round Task 3b, Nov 8 2026).
        // For an email session, show the error and keep the session; the
        // dashboard is the way in. API-key sessions keep the old
        // behaviour: a rejected key signs out to the key gate.
        if (authKind === 'email') {
          setError('This page signs in with an API key. Your email sign-in is still active — open your scans from your dashboard instead.');
          return;
        }
        signOut('That API key was not accepted. Check the key and try again.');
        return;
      }
      setError(errorMessage(err, 'Dashboard could not load. Try refreshing.'));
    } finally {
      setLoading(false);
    }
  }, [apiKey, authKind, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className="ipa-head">
        <div>
          <p className="ipa-eyebrow">InvoiceProof</p>
          <h1 className="ipa-title">Dashboard</h1>
          <p className="ipa-sub">Scan history, usage, and proof exports for your organization.</p>
        </div>
        <div className="ipa-actions">
          <Link className="ipa-btn ipa-btn-primary" href="/invoice-proof/scan">
            New scan
          </Link>
          <Link className="ipa-btn" href="/invoice-proof/settings/data">
            Data and integrations
          </Link>
          <button type="button" className="ipa-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button type="button" className="ipa-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {error ? (
        <p className="ipa-alert ipa-alert-error" role="alert">
          {error}
        </p>
      ) : null}

      {authKind === 'email' && error ? (
        <Link href="/dashboard/scans" className="ipa-link">
          Open your scans in your dashboard
        </Link>
      ) : null}

      {usage ? <UsageMeter usage={usage} /> : null}
      <DashboardStats scans={scans} />

      <section className="ipa-card" aria-labelledby="ipa-history">
        <h2 id="ipa-history">Scan history</h2>
        {loading ? (
          <p className="ipa-muted" aria-live="polite">Loading scans...</p>
        ) : scans.length === 0 ? (
          <div className="ipa-empty">
            <p className="ipa-muted">No scans yet. Run your first invoice scan and it will appear here.</p>
            <Link className="ipa-btn ipa-btn-primary" href="/invoice-proof/scan">
              Start invoice scan
            </Link>
          </div>
        ) : (
          <ScanHistoryTable scans={scans} />
        )}
      </section>

      {proofs.length > 0 ? (
        <section className="ipa-card" aria-labelledby="ipa-proofs">
          <h2 id="ipa-proofs">Proof records</h2>
          <ProofRecordsTable apiKey={apiKey} records={proofs} />
        </section>
      ) : null}
    </>
  );
}
