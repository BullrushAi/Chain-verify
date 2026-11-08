'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

/** A freshly minted key: the raw value exists only in this one response. */
interface CreatedApiKey extends ApiKey {
  apiKey: string;
  warning: string;
}

export function ApiKeysDashboard() {
  const { apiKey, authKind, signOut } = useInvoiceProofSession();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Only an email session may create or retire keys: the API rejects bare
  // API-key identities for these actions, so the controls stay hidden for
  // key-only sessions, with a note explaining why.
  const canManage = authKind === 'email';

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

  async function readErrorMessage(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) return body.message.join(', ');
      if (body.message) return body.message;
    } catch {
      // Response body was not JSON — keep the generic message.
    }
    return 'Request failed';
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/user-dashboard/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-chain-verify-api-key': apiKey },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as CreatedApiKey;
      setJustCreated(created);
      setCopied(false);
      setLabel('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!canManage || revoking) return;
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/user-dashboard/api-keys?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-chain-verify-api-key': apiKey },
      });
      if (res.status === 401) {
        signOut('Session expired');
        return;
      }
      if (!res.ok) throw new Error(await readErrorMessage(res));
      if (justCreated?.id === id) setJustCreated(null);
      setRevokingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
    } finally {
      setRevoking(false);
    }
  }

  async function copyKey() {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.apiKey);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) —
      // the key text is still selectable/visible in the <code> block below.
    }
  }

  if (loading) return (<div className='ipa-stack'><DashboardNav current='api-keys' /><div className='ipa-panel'><p className='ipa-muted'>Loading API keys...</p></div></div>);
  if (error) return (<div className='ipa-stack'><DashboardNav current='api-keys' /><div className='ipa-panel'><p className='ipa-error'>{error}</p><button className='ipa-btn ipa-btn-secondary' onClick={() => void load()}>Retry</button></div></div>);
  if (!keys) return null;

  return (
    <div className='ipa-stack'>
      <DashboardNav current='api-keys' />
      <header className='ipa-panel'>
        <h1 className='ipa-h1'>API Keys</h1>
        <p className='ipa-sub'>Keys that can call the Chain Verify API for your organization. Create a key for each integration — a new key is shown once, when it is created.</p>
        {!canManage && <p className='ipa-muted'>Sign in with email to create or revoke API keys.</p>}
      </header>

      {justCreated && (
        <section className='ipa-panel' role='dialog' aria-label='New API key created'>
          <h2 className='ipa-h2'>API key created</h2>
          <p className='ipa-alert ipa-alert-warn'>Copy it now — it will never be shown again.</p>
          <code className='ipa-mono'>{justCreated.apiKey}</code>
          <div className='ipa-row'>
            <button type='button' className='ipa-btn ipa-btn-secondary' onClick={() => void copyKey()}>
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
            <button type='button' className='ipa-btn ipa-btn-primary' onClick={() => setJustCreated(null)}>
              I have stored this key
            </button>
          </div>
        </section>
      )}

      {canManage && (
        <form className='ipa-panel' onSubmit={handleCreate}>
          <div className='ipa-field'>
            <label className='ipa-label' htmlFor='new-key-label'>Label (optional)</label>
            <input
              id='new-key-label'
              className='ipa-input'
              placeholder='e.g. CI pipeline'
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <button type='submit' className='ipa-btn ipa-btn-primary' disabled={creating}>
            {creating ? 'Creating…' : '+ New API Key'}
          </button>
        </form>
      )}

      <section className='ipa-panel'>
        {keys.length === 0 ? <p className='ipa-muted'>No API keys yet.</p> : (
          <div className='ipa-table-wrap'>
            <table className='ipa-table'>
              <thead><tr><th>Label</th><th>Status</th><th>Last used</th><th>Created</th><th aria-label='Actions' /></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label || 'No label'}</td>
                    <td>{k.active ? 'Active' : 'Inactive'}</td>
                    <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                    <td>{new Date(k.createdAt).toLocaleString()}</td>
                    <td>
                      {k.active && canManage && (revokingId === k.id ? (
                        <span className='ipa-row'>
                          <button
                            type='button'
                            className='ipa-btn ipa-btn-danger ipa-btn-sm'
                            disabled={revoking}
                            onClick={() => void handleRevoke(k.id)}
                          >
                            {revoking ? 'Revoking…' : 'Confirm revoke'}
                          </button>
                          <button type='button' className='ipa-btn ipa-btn-secondary ipa-btn-sm' onClick={() => setRevokingId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button type='button' className='ipa-btn ipa-btn-secondary ipa-btn-sm' onClick={() => setRevokingId(k.id)}>
                          Revoke
                        </button>
                      ))}
                    </td>
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
