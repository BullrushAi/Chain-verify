'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';
import { DashboardNav } from './DashboardNav';

interface Overview {
  /** Null for a fresh email sign-up whose account has no org yet (API answers overview with 404). */
  organization: { id: string; name: string; slug: string; createdAt: string } | null;
  activeApiKeyCount: number;
  verificationRunsThisMonth: number;
  /** Scans in a state that needs a human look (FAILED + NEEDS_REVIEW). Undefined on older APIs. */
  scansNeedingReview?: number;
  recentRuns: Array<{ id: string; product: string; status: string; riskLevel: string; createdAt: string; updatedAt: string }>;
}

interface Billing {
  entitlements: Array<{ id: string; product: string; planSlug: string; status: string; monthlyLimit: number | null }>;
  usageThisMonth: Array<{ product: string; count: number }>;
}

export function UserDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/overview', {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      // A fresh email sign-up has no org: the API answers overview with 404
      // ('Organization not found', Task 1 contract). That is an empty
      // dashboard, not an error — zero counts, no org, no scans yet. The
      // billing fetch is skipped too: it would only return empty anyway.
      if (res.status === 404) {
        setOverview({
          organization: null,
          activeApiKeyCount: 0,
          verificationRunsThisMonth: 0,
          scansNeedingReview: 0,
          recentRuns: [],
        });
        setBilling(null);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to load dashboard');
      setOverview(await res.json());
      setError(null);
      // Usage vs plan is a bonus section: if billing fails, the dashboard still loads without it.
      try {
        const billingRes = await fetch('/api/proxy/user-dashboard/billing', {
          headers: { 'x-chain-verify-api-key': apiKey },
        });
        if (billingRes.ok) setBilling(await billingRes.json());
      } catch {
        /* usage section stays hidden */
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiKey, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className='ipa-stack'>
      <DashboardNav orgName={overview?.organization?.name} current='dashboard' />
      {loading ? (
        <div className='ipa-panel'><p className='ipa-muted'>Loading dashboard...</p></div>
      ) : error ? (
        <div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div>
      ) : !overview ? null : (
        <>
          <header className='ipa-panel'>
            <div>
              <h1 className='ipa-h1'>Dashboard</h1>
              <p className='ipa-sub'>{overview.organization ? `${overview.organization.name} (${overview.organization.slug})` : 'No organization linked to this account yet.'}</p>
            </div>
          </header>

          {billing ? (
            <section className='ipa-panel'>
              <h2 className='ipa-h2'>Usage vs plan</h2>
              {billing.entitlements.length === 0 ? (
                <p className='ipa-muted'>{overview.verificationRunsThisMonth} scans this month. No plan on file.</p>
              ) : (
                <div className='ipa-table-wrap'>
                  <table className='ipa-table'>
                    <thead><tr><th>Product</th><th>Plan</th><th>Scans this month</th><th>Monthly limit</th></tr></thead>
                    <tbody>
                      {billing.entitlements.map((e) => {
                        const used = billing.usageThisMonth.find((u) => u.product === e.product)?.count ?? 0;
                        return (
                          <tr key={e.id}>
                            <td>{e.product}</td>
                            <td>{e.planSlug}</td>
                            <td>{used}</td>
                            <td>{e.monthlyLimit === null ? 'No limit' : e.monthlyLimit}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          <section className='ipa-panel'>
            <h2 className='ipa-h2'>Overview</h2>
            <div className='ipa-grid ipa-grid-3'>
              <div className='ipa-card'><div className='ipa-kpi'>{overview.activeApiKeyCount}</div><div className='ipa-kpi-label'>Active API keys</div></div>
              <div className='ipa-card'><div className='ipa-kpi'>{overview.verificationRunsThisMonth}</div><div className='ipa-kpi-label'>Scans this month</div></div>
              <div className='ipa-card'><div className='ipa-kpi'>{overview.scansNeedingReview ?? '—'}</div><div className='ipa-kpi-label'>Scans needing review</div></div>
            </div>
          </section>

          <section className='ipa-panel'>
            <div className='ipa-row' style={{justifyContent:'space-between',alignItems:'center'}}>
              <h2 className='ipa-h2'>Recent scans</h2>
              <Link className='ipa-link' href='/dashboard/scans'>View all</Link>
            </div>
            {overview.recentRuns.length === 0 ? <p className='ipa-muted'>No scans yet.</p> : (
              <div className='ipa-table-wrap'>
                <table className='ipa-table'>
                  <thead><tr><th>ID</th><th>Product</th><th>Status</th><th>Risk</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {overview.recentRuns.map((r) => (
                      <tr key={r.id}>
                        <td className='ipa-mono'>{r.id.slice(0,12)}...</td>
                        <td>{r.product}</td>
                        <td>{r.status}</td>
                        <td>{r.riskLevel}</td>
                        <td>{new Date(r.createdAt).toLocaleString()}</td>
                        <td><Link className='ipa-link' href={`/dashboard/scans/${r.id}`}>Review</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
