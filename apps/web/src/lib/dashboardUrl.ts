/** Live Chain Verify API. The two hosts below 404 /api/user-dashboard. */
export const CANONICAL_API_ORIGIN = 'https://chain-verify-api-63eg.onrender.com';

const LOCAL_API_ORIGIN = 'http://localhost:3001';

const STALE_API_HOSTS = new Set([
  'chain-verify-api.onrender.com',
  'api.chainverify.org',
]);

export type UserDashboardRoute =
  | 'overview'
  | 'scans'
  | 'api-keys'
  | 'billing'
  | 'organization'
  | 'settings';

/**
 * Trim a configured API base and swap a retired host for the live origin.
 * Blank input stays blank so the caller can apply its own default.
 * Localhost and every other host are returned unchanged.
 */
export function resolveConfiguredApiBase(base: string | null | undefined): string {
  const trimmed = (base ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (STALE_API_HOSTS.has(url.hostname)) return CANONICAL_API_ORIGIN;
    return trimmed;
  } catch {
    return trimmed;
  }
}

/** Client default when the public env is unset. A stale override is rewritten. */
export function resolvePublicApiBase(base: string | null | undefined): string {
  return resolveConfiguredApiBase(base) || CANONICAL_API_ORIGIN;
}

/** Server dashboard target. An empty base is local dev; search is appended as-is. */
export function dashboardUrl(
  base: string | null | undefined,
  suffix: UserDashboardRoute,
  search?: string,
): string {
  const origin = resolveConfiguredApiBase(base) || LOCAL_API_ORIGIN;
  const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
  return `${origin}/api/user-dashboard/${suffix}${query}`;
}
