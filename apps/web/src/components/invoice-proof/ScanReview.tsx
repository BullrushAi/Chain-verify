'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage, InvoiceProofApiError, invoiceProofApi } from '@/lib/invoice-proof/client';
import type { ApprovalDecision, ScanReviewPayload } from '@/lib/invoice-proof/types';

import { ApprovalCard } from './ApprovalCard';
import { useInvoiceProofSession } from './useInvoiceProofSession';

export interface ScanReviewProps {
  scanId: string;
}

export function ScanReview({ scanId }: ScanReviewProps) {
  const { apiKey, authKind, signOut } = useInvoiceProofSession();
  const [review, setReview] = useState<ScanReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof InvoiceProofApiError && (err.status === 401 || err.status === 403)) {
        // This review endpoint takes an API key only. An email session has
        // no key (apiKey is ''), so a 401/403 here says nothing about the
        // email session — it must NOT sign the user out. The old code called
        // signOut() unconditionally, and the gate's signOut posts
        // /api/auth/logout, which deletes every session: that is how merely
        // visiting this page from the dashboard destroyed the dashboard
        // email session live (CBV fix round Task 3, Nov 8 2026). For an
        // email session, show the error and keep the session; the dashboard
        // detail page is the way in. API-key sessions keep the old
        // behaviour: a rejected key signs out to the key gate.
        if (authKind === 'email') {
          setError('This review page signs in with an API key. Your email sign-in is still active — open the scan from your dashboard instead.');
          return;
        }
        signOut('That API key was not accepted. Check the key and try again.');
        return;
      }
      setError(errorMessage(err, fallback));
    },
    [authKind, signOut],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoiceProofApi
      .getReview(apiKey, scanId)
      .then((data) => {
        if (!cancelled) setReview({ scan: data.scan, approvals: data.approvals ?? [] });
      })
      .catch((err: unknown) => {
        if (!cancelled) handleError(err, 'Failed to load this review.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, scanId, handleError]);

  async function decide(approvalId: string, decision: ApprovalDecision) {
    setDeciding(true);
    setError(null);
    try {
      await invoiceProofApi.decideApproval(apiKey, scanId, approvalId, decision);
      setReview((prev) =>
        prev
          ? { ...prev, approvals: prev.approvals.map((a) => (a.id === approvalId ? { ...a, status: decision } : a)) }
          : prev,
      );
    } catch (err) {
      handleError(err, 'Could not record that decision.');
    } finally {
      setDeciding(false);
    }
  }

  async function exportProof(format: 'pdf' | 'json') {
    const proofId = review?.scan.proofRecordId;
    if (!proofId) return;
    setExporting(format);
    setError(null);
    try {
      await invoiceProofApi.downloadProofExport(apiKey, proofId, format);
    } catch (err) {
      handleError(err, 'Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <header>
        <p className="ipa-eyebrow">InvoiceProof</p>
        <h1 className="ipa-title">Scan review</h1>
        <p className="ipa-sub ipa-mono">{scanId}</p>
      </header>

      {error ? (
        <p className="ipa-alert ipa-alert-error" role="alert">
          {error}
        </p>
      ) : null}

      {review?.scan.proofRecordId ? (
        <div className="ipa-actions">
          {(['pdf', 'json'] as const).map((format) => (
            <button
              key={format}
              type="button"
              className="ipa-btn ipa-btn-sm"
              disabled={exporting === format}
              onClick={() => void exportProof(format)}
            >
              {exporting === format ? 'Preparing...' : `Export proof (${format.toUpperCase()})`}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <p className="ipa-muted" aria-live="polite">Loading review...</p> : null}
      {!loading && review && review.approvals.length === 0 ? (
        <p className="ipa-alert">No flagged items need a decision for this scan.</p>
      ) : null}

      <ul className="ipa-list">
        {(review?.approvals ?? []).map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} deciding={deciding} onDecide={decide} />
        ))}
      </ul>

      {authKind === 'email' ? (
        <Link href={`/dashboard/scans/${scanId}`} className="ipa-link">
          Open this scan in your dashboard
        </Link>
      ) : (
        <Link href="/invoice-proof/dashboard" className="ipa-link">
          Back to dashboard
        </Link>
      )}
    </>
  );
}
