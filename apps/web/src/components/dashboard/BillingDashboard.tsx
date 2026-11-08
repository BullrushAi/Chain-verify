'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';
import { DashboardNav } from './DashboardNav';

interface Entitlement {
  id: string;
  product: string;
  planSlug: string;
  status: string;
  monthlyLimit: number | null;
  periodStart: string;
  periodEnd: string | null;
  meteredBillingEnabled: boolean;
  lastPaymentAt: string | null;
  canceledAt: string | null;
  createdAt: string;
}

interface Billing {
  entitlements: Entitlement[];
  usageThisMonth: Array<{ product: string; count: number }>;
}

export function BillingDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/billing', {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error('Failed to load billing');
      setBilling(await res.json());
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

  if (loading) return (<div className='ipa-stack'><DashboardNav current='billing' /><div className='ipa-panel'><p className='ipa-muted'>Loading billing...</p></div></div>);
  if (error) return (<div className='ipa-stack'><DashboardNav current='billing' /><div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div></div>);
  if (!billing) return null;

  return (
    <div className='ipa-stack'>
      <DashboardNav current='billing' />
      <header className='ipa-panel'>
        <h1 className='ipa-h1'>Billing / Subscription</h1>
        <p className='ipa-sub'>Your plans and how much you have used this month.</p>
      </header>

      <section className='ipa-panel'>
        <h2 className='ipa-h2'>Your plans</h2>
        {billing.entitlements.length === 0 ? <p className='ipa-muted'>No plans found for your organization.</p> : (
          <div className='ipa-table-wrap'>
            <table className='ipa-table'>
              <thead><tr><th>Product</th><th>Plan</th><th>Status</th><th>Monthly limit</th><th>Period ends</th><th>Metered billing</th><th>Last payment</th></tr></thead>
              <tbody>
                {billing.entitlements.map((e) => (
                  <tr key={e.id}>
                    <td>{e.product}</td>
                    <td>{e.planSlug}</td>
                    <td>{e.status}</td>
                    <td>{e.monthlyLimit === null ? 'Not set' : e.monthlyLimit}</td>
                    <td>{e.periodEnd ? new Date(e.periodEnd).toLocaleDateString() : 'No end date'}</td>
                    <td>{e.meteredBillingEnabled ? 'Yes' : 'No'}</td>
                    <td>{e.lastPaymentAt ? new Date(e.lastPaymentAt).toLocaleDateString() : 'None recorded'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className='ipa-panel'>
        <h2 className='ipa-h2'>Scans this month</h2>
        {billing.usageThisMonth.length === 0 ? <p className='ipa-muted'>No scans this month.</p> : (
          <div className='ipa-table-wrap'>
            <table className='ipa-table'>
              <thead><tr><th>Product</th><th>Scans</th></tr></thead>
              <tbody>
                {billing.usageThisMonth.map((u) => (
                  <tr key={u.product}><td>{u.product}</td><td>{u.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
