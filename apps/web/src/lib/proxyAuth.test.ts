import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  proxyAuthHeaders,
  proxyFetchWithSessionFallback,
  proxySessionHeaders,
  type ProxyAuthRequest,
} from './proxyAuth';

/**
 * Task 1 follow-up: a revoked API key left in sessionStorage must not lock
 * out an email-signed-in user. The dashboard proxy call goes out with the
 * dead key first, gets a 401, and must then succeed with the session cookie
 * instead of surfacing the 401 (which would sign the user out entirely).
 */

function makeRequest(opts: { apiKey?: string; session?: string }): ProxyAuthRequest {
  const headers = new Headers();
  if (opts.apiKey) headers.set('x-chain-verify-api-key', opts.apiKey);
  return {
    headers,
    cookies: {
      get: (name: string) =>
        name === 'cv_session' && opts.session ? { value: opts.session } : undefined,
    },
  } as unknown as ProxyAuthRequest;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proxyAuthHeaders', () => {
  it('prefers a stored API key when one is sent', () => {
    expect(proxyAuthHeaders(makeRequest({ apiKey: 'cv_live_key', session: 'sess-1' }))).toEqual({
      Authorization: 'Bearer cv_live_key',
    });
  });

  it('uses the session cookie when no key is sent', () => {
    expect(proxyAuthHeaders(makeRequest({ session: 'sess-1' }))).toEqual({
      Authorization: 'Bearer sess-1',
    });
  });

  it('returns no auth headers when neither credential is present', () => {
    expect(proxyAuthHeaders(makeRequest({}))).toEqual({});
    expect(proxySessionHeaders(makeRequest({}))).toBeNull();
  });
});

describe('proxyFetchWithSessionFallback', () => {
  const URL = 'https://api.example.test/api/user-dashboard/overview';

  it('retries with the session cookie when a dead stored key 401s, and the call succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { organization: { name: 'Acme' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(
      makeRequest({ apiKey: 'cv_revoked_dead_key', session: 'valid-session-token' }),
      URL,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ organization: { name: 'Acme' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer cv_revoked_dead_key' });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer valid-session-token' });
  });

  it('returns the 401 without retrying when there is no session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(makeRequest({ apiKey: 'cv_revoked_dead_key' }), URL);

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the first attempt already used the session', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(makeRequest({ session: 'expired-session' }), URL);

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a single call when the stored key works', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(
      makeRequest({ apiKey: 'cv_live_key', session: 'valid-session-token' }),
      URL,
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer cv_live_key' });
  });
});
