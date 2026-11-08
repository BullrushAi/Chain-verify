import type { NextRequest } from 'next/server';

/**
 * Authorization headers for proxied dashboard calls (Task 1).
 * The API key stays the machine credential and the front door for API users;
 * an email session (httpOnly `cv_session` cookie, set by /api/auth/verify-code)
 * is forwarded as a Bearer token when no API key is supplied. The API's
 * identity adapter accepts both.
 */
export function proxyAuthHeaders(request: NextRequest): Record<string, string> {
  const apiKeyHeader = request.headers.get('x-chain-verify-api-key') || request.headers.get('authorization') || '';
  const apiKey = apiKeyHeader.replace('Bearer ', '').trim();
  if (apiKey) return { Authorization: 'Bearer ' + apiKey };
  const session = request.cookies.get('cv_session')?.value?.trim();
  if (session) return { Authorization: 'Bearer ' + session };
  return {};
}
