'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';

interface Organization {
  id: string;
  name: string;
  slug: string;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function OrganizationDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/organization', {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error('Failed to load organization');
      setOrg(await res.json());
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

  if (loading) return <div className='ipa-panel'><p className='ipa-muted'>Loading organization...</p></div>;
  if (error) return <div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div>;
  if (!org) return null;

  return (
    <div className='ipa-stack'>
      <header className='ipa-panel'>
        <div className='ipa-row' style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className='ipa-h1'>Organization / Team</h1>
          <Link className='ipa-link' href='/dashboard'>Back to Dashboard</Link>
        </div>
        <p className='ipa-sub'>{org.name}</p>
      </header>

      <section className='ipa-panel'>
        <div className='ipa-table-wrap'>
          <table className='ipa-table'>
            <tbody>
              <tr><th>Name</th><td>{org.name}</td></tr>
              <tr><th>Slug</th><td className='ipa-mono'>{org.slug}</td></tr>
              <tr><th>Organization ID</th><td className='ipa-mono'>{org.id}</td></tr>
              <tr><th>Stripe customer</th><td>{org.stripeCustomerId ? <span className='ipa-mono'>{org.stripeCustomerId}</span> : 'Not linked'}</td></tr>
              <tr><th>Created</th><td>{new Date(org.createdAt).toLocaleString()}</td></tr>
              <tr><th>Last updated</th><td>{new Date(org.updatedAt).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
