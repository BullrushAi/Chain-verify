import type { NextRequest } from 'next/server';

/** The request surface the proxy auth helpers need: headers + cookies. */
export type ProxyAuthRequest = Pick<NextRequest, 'headers' | 'cookies'>;

/**
 * Authorization headers for proxied dashboard calls (Task 1).
 * The API key stays the machine credential and the front door for API users;
 * an email session (httpOnly `cv_session` cookie, set by /api/auth/verify-code)
 * is forwarded as a Bearer <redacted> when no API key is supplied. The API's
 * identity adapter accepts both.
 */
export function proxyAuthHeaders(request: ProxyAuthRequest): Record<string, string> {
  const apiKeyHeader = request.headers.get('x-chain-verify-api-key') || request.headers.get('authorization') || '';
  const apiKey = apiKeyHeader.replace('Bearer ', '').trim();
  if (apiKey) return { Authorization: 'Bearer ' + apiKey };
  const session = request.cookies.get('cv_session')?.value?.trim();
  if (session) return { Authorization: 'Bearer ' + session };
  return {};
}

/** Bearer headers for the email session cookie, or null when there is none. */
export function proxySessionHeaders(request: ProxyAuthRequest): Record<string, string> | null {
  const session = request.cookies.get('cv_session')?.value?.trim();
  if (!session) return null;
  return { Authorization: 'Bearer ' + session };
}

/**
 * Fetch a dashboard API URL with the stored-key-first credentials, falling
 * back to the email session on a 401 (Task 1 follow-up).
 *
 * A revoked API key left in sessionStorage must not lock out an
 * email-signed-in user: the browser keeps sending the dead key, the API
 * answers 401, and without this retry the page's 401 handler would sign the
 * user out entirely — even though their session is valid. So when the
 * key-first attempt 401s and a session cookie is present, retry once with
 * the session. No retry when the first attempt already used the session
 * (same credentials would 401 again) or when there is no session at all.
 * The first attempt runs before any handler code, so a 401 means the API
 * rejected auth before any mutation — retrying a POST/DELETE body is safe.
 */
export async function proxyFetchWithSessionFallback(
  request: ProxyAuthRequest,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const keyHeaders = proxyAuthHeaders(request);
  const first = await fetch(url, { ...init, headers: keyHeaders, cache: 'no-store' });
  if (first.status !== 401) return first;
  const sessionHeaders = proxySessionHeaders(request);
  if (!sessionHeaders) return first;
  if (keyHeaders.Authorization === sessionHeaders.Authorization) return first;
  return fetch(url, { ...init, headers: sessionHeaders, cache: 'no-store' });
}
