'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';
import { DashboardNav } from './DashboardNav';

interface ApiKey {
  id: string;
  organizationId: string;
  label: string | null;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function ApiKeysDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/api-keys', {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error('Failed to load API keys');
      setKeys(await res.json());
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

  if (loading) return (<div className='ipa-stack'><DashboardNav current='api-keys' /><div className='ipa-panel'><p className='ipa-muted'>Loading API keys...</p></div></div>);
  if (error) return (<div className='ipa-stack'><DashboardNav current='api-keys' /><div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div></div>);
  if (!keys) return null;

  return (
    <div className='ipa-stack'>
      <DashboardNav current='api-keys' />
      <header className='ipa-panel'>
        <h1 className='ipa-h1'>API Keys</h1>
        <p className='ipa-sub'>Keys that can call the Chain Verify API for your organization. This list is read-only — keys are added and removed through Chain Verify admin flows.</p>
      </header>

      <section className='ipa-panel'>
        {keys.length === 0 ? <p className='ipa-muted'>No API keys yet.</p> : (
          <div className='ipa-table-wrap'>
            <table className='ipa-table'>
              <thead><tr><th>Label</th><th>Status</th><th>Last used</th><th>Created</th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label || 'No label'}</td>
                    <td>{k.active ? 'Active' : 'Inactive'}</td>
                    <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                    <td>{new Date(k.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
