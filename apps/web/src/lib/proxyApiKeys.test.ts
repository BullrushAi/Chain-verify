import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyFetchWithSessionFallback, type ProxyAuthRequest } from './proxyAuth';

/**
 * Task 3: the api-keys proxy forwards POST (create) and DELETE (retire) with
 * the same key-first / session-on-401 auth as GET. A 401 means the API
 * rejected auth before any mutation, so retrying the mutation with the
 * session is safe — but only if the retry re-sends the identical method and
 * body. These tests prove the retry carries both.
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

const URL = 'https://api.example.test/api/user-dashboard/api-keys';

describe('proxyFetchWithSessionFallback — customer key mutations', () => {
  it('re-sends the identical POST body on the session retry after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'key-1', apiKey: 'cv_live_new' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(
      makeRequest({ apiKey: 'cv_revoked_dead_key', session: 'valid-session-token' }),
      URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'CI' }),
      },
    );

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ label: 'CI' }));
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer valid-session-token' });
  });

  it('re-sends DELETE with the session after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'key-1', active: false }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(
      makeRequest({ apiKey: 'cv_revoked_dead_key', session: 'valid-session-token' }),
      `${URL}/key-1`,
      { method: 'DELETE' },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer valid-session-token' });
  });

  it('returns the 401 without retrying a POST when there is no session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(makeRequest({ apiKey: 'cv_revoked_dead_key' }), URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'CI' }),
    });

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a single POST call when the stored key works', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, { id: 'key-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyFetchWithSessionFallback(
      makeRequest({ apiKey: 'cv_live_key', session: 'valid-session-token' }),
      URL,
      { method: 'POST', body: JSON.stringify({ label: 'CI' }) },
    );

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
