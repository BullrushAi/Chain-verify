'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';

interface Overview {
  organization: { id: string; name: string; slug: string; createdAt: string };
  activeApiKeyCount: number;
  verificationRunsThisMonth: number;
  recentRuns: Array<{ id: string; product: string; status: string; riskLevel: string; createdAt: string; updatedAt: string }>;
}

export function UserDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [overview, setOverview] = useState<Overview | null>(null);
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
      if (!res.ok) throw new Error('Failed to load dashboard');
      setOverview(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiKey, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className='ipa-panel'><p className='ipa-muted'>Loading dashboard...</p></div>;
  if (error) return <div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div>;
  if (!overview) return null;

  return (
    <div className='ipa-stack'>
      <header className='ipa-panel'>
        <div className='ipa-row' style={{justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <h1 className='ipa-h1'>Dashboard</h1>
            <p className='ipa-sub'>{overview.organization.name} ({overview.organization.slug})</p>
          </div>
          <button className='ipa-btn ipa-btn-secondary' onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      <section className='ipa-panel'>
        <h2 className='ipa-h2'>Overview</h2>
        <div className='ipa-grid ipa-grid-3'>
          <div className='ipa-card'><div className='ipa-kpi'>{overview.activeApiKeyCount}</div><div className='ipa-kpi-label'>Active API keys</div></div>
          <div className='ipa-card'><div className='ipa-kpi'>{overview.verificationRunsThisMonth}</div><div className='ipa-kpi-label'>Scans this month</div></div>
          <div className='ipa-card'><div className='ipa-kpi'>{overview.recentRuns.length}</div><div className='ipa-kpi-label'>Recent scans</div></div>
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
              <thead><tr><th>ID</th><th>Product</th><th>Status</th><th>Risk</th><th>Created</th></tr></thead>
              <tbody>
                {overview.recentRuns.map((r) => (
                  <tr key={r.id}><td className='ipa-mono'>{r.id.slice(0,12)}...</td><td>{r.product}</td><td>{r.status}</td><td>{r.riskLevel}</td><td>{new Date(r.createdAt).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav className='ipa-panel'>
        <h2 className='ipa-h2'>Quick links</h2>
        <div className='ipa-row'>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/scans'>Scans / History</Link>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/api-keys'>API Keys</Link>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/billing'>Billing / Subscription</Link>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/organization'>Organization / Team</Link>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/settings'>Settings</Link>
        </div>
      </nav>
    </div>
  );
}
