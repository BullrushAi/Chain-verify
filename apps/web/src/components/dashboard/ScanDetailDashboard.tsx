'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';
import { DashboardNav } from './DashboardNav';

interface Scan {
  id: string;
  product: string;
  sourceType: string;
  status: string;
  riskLevel: string;
  inputSummary: string;
  outputSummary: string | null;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
  /** Stored findings (VerificationRun.issuesFound). Optional: older API builds omit it. */
  issuesFound?: DashboardFinding[] | null;
}

/**
 * One stored finding, as written to VerificationRun.issuesFound. Two shapes
 * exist: the invoice-proof scan writes proof-core findings
 * ({severity, pattern, detail, rows, evidence}); the /verify path writes
 * rule issues ({rule, severity, message, recommended_action,
 * source_passage}). Both render the same way — a title, a detail line, and
 * whatever supporting fields are present. A non-object entry renders as its
 * string form rather than crashing the page.
 */
interface DashboardFinding {
  severity?: string;
  pattern?: string;
  detail?: string;
  rows?: string[];
  evidence?: string;
  rule?: string;
  message?: string;
  recommended_action?: string;
  source_passage?: string;
}

function findingTitle(f: DashboardFinding): string {
  return f.pattern ?? f.rule ?? 'Finding';
}

function findingDetail(f: DashboardFinding): string {
  return f.detail ?? f.message ?? '';
}

function normalizeFindings(raw: unknown): DashboardFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === 'string') return [{ detail: item }];
    if (item && typeof item === 'object') return [item as DashboardFinding];
    return [];
  });
}

/**
 * One scan, inside the dashboard (CBV fix round Task 3, Nov 8 2026).
 *
 * The scan rows used to link out to /invoice-proof/review/<id>, the vendor
 * review page. That page only accepts an API key: for an email session it
 * sent `Authorization: Bearer ` (empty key), got a 401, and called
 * signOut() — which posts /api/auth/logout and deletes every session. So
 * merely opening a Review link destroyed the dashboard session live.
 *
 * This page instead reads the scan through the dashboard's own proxy
 * (/api/proxy/user-dashboard/scans/<id>), which forwards the email session
 * cookie. A 404 is a not-found page, not an error and never a sign-out:
 * the id may belong to another org, or the session may have no org at all
 * (Task 1 contract: single-scan reads 404 for a no-org session).
 */
export function ScanDetailDashboard({ scanId }: { scanId: string }) {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [scan, setScan] = useState<Scan | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/scans/' + encodeURIComponent(scanId), {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (res.status === 404) {
        setScan(null);
        setNotFound(true);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to load scan');
      setScan(await res.json());
      setNotFound(false);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiKey, scanId, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return (<div className='ipa-stack'><DashboardNav current='scans' /><div className='ipa-panel'><p className='ipa-muted'>Loading scan...</p></div></div>);
  if (error) return (<div className='ipa-stack'><DashboardNav current='scans' /><div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button><p style={{ marginTop: '12px' }}><Link className='ipa-link' href='/dashboard/scans'>Back to scans</Link></p></div></div>);
  if (notFound || !scan) return (<div className='ipa-stack'><DashboardNav current='scans' /><div className='ipa-panel'><h1 className='ipa-h1'>Scan not found</h1><p className='ipa-muted'>This scan doesn&apos;t exist, or it belongs to a different organization.</p><p style={{ marginTop: '12px' }}><Link className='ipa-link' href='/dashboard/scans'>Back to scans</Link></p></div></div>);

  const findings = normalizeFindings(scan.issuesFound);

  return (
    <div className='ipa-stack'>
      <DashboardNav current='scans' />
      <header className='ipa-panel'>
        <h1 className='ipa-h1'>Scan detail</h1>
        <p className='ipa-sub ipa-mono'>{scan.id}</p>
      </header>

      <section className='ipa-panel'>
        <div className='ipa-table-wrap'>
          <table className='ipa-table'>
            <tbody>
              <tr><th>Product</th><td>{scan.product}</td></tr>
              <tr><th>Source</th><td>{scan.sourceType}</td></tr>
              <tr><th>Status</th><td>{scan.status}</td></tr>
              <tr><th>Risk</th><td>{scan.riskLevel}</td></tr>
              <tr><th>Confidence</th><td>{scan.confidence === null ? '—' : scan.confidence}</td></tr>
              <tr><th>Input</th><td>{scan.inputSummary}</td></tr>
              <tr><th>Result</th><td>{scan.outputSummary || '—'}</td></tr>
              <tr><th>Created</th><td>{new Date(scan.createdAt).toLocaleString()}</td></tr>
              <tr><th>Updated</th><td>{new Date(scan.updatedAt).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: '12px' }}><Link className='ipa-link' href='/dashboard/scans'>Back to scans</Link></p>
      </section>

      <section className='ipa-panel'>
        <h2 className='ipa-h2'>Findings ({findings.length})</h2>
        {findings.length === 0 ? (
          <p className='ipa-muted'>No individual findings recorded for this scan.</p>
        ) : (
          <div>
            {findings.map((finding, i) => (
              <div key={i} style={{ marginBottom: '16px' }}>
                <p><strong>{findingTitle(finding)}</strong>{finding.severity ? ` — ${finding.severity}` : ''}</p>
                {findingDetail(finding) ? <p>{findingDetail(finding)}</p> : null}
                {finding.rows && finding.rows.length > 0 ? <p className='ipa-muted'>Invoices: {finding.rows.join(', ')}</p> : null}
                {finding.evidence ? <p className='ipa-muted'>Evidence: {finding.evidence}</p> : null}
                {finding.recommended_action ? <p className='ipa-muted'>Recommended action: {finding.recommended_action}</p> : null}
                {finding.source_passage ? <p className='ipa-muted'>Source: {finding.source_passage}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
