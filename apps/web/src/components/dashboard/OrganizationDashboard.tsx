'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';
import { DashboardNav } from './DashboardNav';

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
  const [apiKeyCount, setApiKeyCount] = useState<number | null>(null);
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
      // The old Settings page's one extra fact (key count) now lives here.
      // If it fails, the organization table still loads without that row.
      try {
        const settingsRes = await fetch('/api/proxy/user-dashboard/settings', {
          headers: { 'x-chain-verify-api-key': apiKey },
        });
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (typeof data.apiKeyCount === 'number') setApiKeyCount(data.apiKeyCount);
        }
      } catch {
        /* key-count row stays hidden */
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

  if (loading) return (<div className='ipa-stack'><DashboardNav current='organization' /><div className='ipa-panel'><p className='ipa-muted'>Loading organization...</p></div></div>);
  if (error) return (<div className='ipa-stack'><DashboardNav current='organization' /><div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div></div>);
  if (!org) return null;

  return (
    <div className='ipa-stack'>
      <DashboardNav orgName={org.name} current='organization' />
      <header className='ipa-panel'>
        <h1 className='ipa-h1'>Organization / Team</h1>
        <p className='ipa-sub'>{org.name} — organization settings live here; the Settings page now opens this page.</p>
      </header>

      <section className='ipa-panel'>
        <div className='ipa-table-wrap'>
          <table className='ipa-table'>
            <tbody>
              <tr><th>Name</th><td>{org.name}</td></tr>
              <tr><th>Slug</th><td className='ipa-mono'>{org.slug}</td></tr>
              <tr><th>Organization ID</th><td className='ipa-mono'>{org.id}</td></tr>
              <tr><th>Stripe customer</th><td>{org.stripeCustomerId ? <span className='ipa-mono'>{org.stripeCustomerId}</span> : 'Not linked'}</td></tr>
              {apiKeyCount !== null ? (<tr><th>API keys on this account</th><td>{apiKeyCount}</td></tr>) : null}
              <tr><th>Created</th><td>{new Date(org.createdAt).toLocaleString()}</td></tr>
              <tr><th>Last updated</th><td>{new Date(org.updatedAt).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
