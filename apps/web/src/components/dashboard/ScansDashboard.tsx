'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInvoiceProofSession } from '@/components/invoice-proof/useInvoiceProofSession';

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
}

interface ScansResponse {
  items: Scan[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;

export function ScansDashboard() {
  const { apiKey, signOut } = useInvoiceProofSession();
  const [items, setItems] = useState<Scan[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proxy/user-dashboard/scans?limit=' + PAGE_SIZE, {
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error('Failed to load scans');
      const data: ScansResponse = await res.json();
      setItems(data.items);
      setNextCursor(data.nextCursor);
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

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      setLoadingMore(true);
      const res = await fetch(
        '/api/proxy/user-dashboard/scans?limit=' + PAGE_SIZE + '&cursor=' + encodeURIComponent(nextCursor),
        { headers: { 'x-chain-verify-api-key': apiKey } },
      );
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error('Failed to load more scans');
      const data: ScansResponse = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <div className='ipa-panel'><p className='ipa-muted'>Loading scans...</p></div>;
  if (error) return <div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div>;

  return (
    <div className='ipa-stack'>
      <header className='ipa-panel'>
        <div className='ipa-row' style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className='ipa-h1'>Scans / History</h1>
          <Link className='ipa-link' href='/dashboard'>Back to Dashboard</Link>
        </div>
        <p className='ipa-sub'>Every verification run on your account, newest first.</p>
      </header>

      <section className='ipa-panel'>
        {items.length === 0 ? <p className='ipa-muted'>No scans yet.</p> : (
          <div className='ipa-table-wrap'>
            <table className='ipa-table'>
              <thead><tr><th>ID</th><th>Product</th><th>Source</th><th>Status</th><th>Risk</th><th>Confidence</th><th>Summary</th><th>Created</th></tr></thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td className='ipa-mono'>{s.id.slice(0, 12)}...</td>
                    <td>{s.product}</td>
                    <td>{s.sourceType}</td>
                    <td>{s.status}</td>
                    <td>{s.riskLevel}</td>
                    <td>{s.confidence === null ? '—' : s.confidence}</td>
                    <td>{s.outputSummary || s.inputSummary}</td>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextCursor ? (
          <div className='ipa-row' style={{ marginTop: '12px' }}>
            <button className='ipa-btn ipa-btn-secondary' onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
