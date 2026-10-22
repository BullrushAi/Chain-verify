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

interface Settings {
  organization: Organization;
  apiKeyCount: number;
}

export function SettingsDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/settings', {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error('Failed to load settings');
      setSettings(await res.json());
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

  if (loading) return <div className='ipa-panel'><p className='ipa-muted'>Loading settings...</p></div>;
  if (error) return <div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div>;
  if (!settings) return null;

  const org = settings.organization;

  return (
    <div className='ipa-stack'>
      <header className='ipa-panel'>
        <div className='ipa-row' style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className='ipa-h1'>Settings</h1>
          <Link className='ipa-link' href='/dashboard'>Back to Dashboard</Link>
        </div>
        <p className='ipa-sub'>Account details from your organization record.</p>
      </header>

      <section className='ipa-panel'>
        <div className='ipa-table-wrap'>
          <table className='ipa-table'>
            <tbody>
              <tr><th>Organization</th><td>{org.name}</td></tr>
              <tr><th>Slug</th><td className='ipa-mono'>{org.slug}</td></tr>
              <tr><th>Organization ID</th><td className='ipa-mono'>{org.id}</td></tr>
              <tr><th>API keys on this account</th><td>{settings.apiKeyCount}</td></tr>
              <tr><th>Account created</th><td>{new Date(org.createdAt).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <nav className='ipa-panel'>
        <h2 className='ipa-h2'>Manage</h2>
        <div className='ipa-row'>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/api-keys'>API Keys</Link>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/billing'>Billing / Subscription</Link>
          <Link className='ipa-btn ipa-btn-secondary' href='/dashboard/organization'>Organization / Team</Link>
        </div>
      </nav>
    </div>
  );
}
