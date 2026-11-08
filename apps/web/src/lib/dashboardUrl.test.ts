import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_API_ORIGIN,
  dashboardUrl,
  resolvePublicApiBase,
  type UserDashboardRoute,
} from './dashboardUrl';

const ROUTES: UserDashboardRoute[] = [
  'overview',
  'scans',
  'api-keys',
  'billing',
  'organization',
  'settings',
];

const STALE_BASES = [
  'https://chain-verify-api.onrender.com',
  'http://chain-verify-api.onrender.com/',
  'https://api.chainverify.org',
  'http://API.ChainVerify.org/',
];

describe('dashboardUrl', () => {
  it('targets /api/user-dashboard/overview on chain-verify-api-63eg.onrender.com', () => {
    const url = dashboardUrl('https://chain-verify-api-63eg.onrender.com', 'overview');

    expect(url).toBe(
      'https://chain-verify-api-63eg.onrender.com/api/user-dashboard/overview',
    );
    expect(new URL(url).hostname).toBe('chain-verify-api-63eg.onrender.com');
    expect(new URL(url).pathname).toBe('/api/user-dashboard/overview');
    expect(url).toContain('/api/user-dashboard/overview');
  });

  it('rewrites either stale host and still uses /api/user-dashboard/overview', () => {
    for (const stale of STALE_BASES) {
      const url = dashboardUrl(stale, 'overview');
      const parsed = new URL(url);

      expect(parsed.hostname).toBe('chain-verify-api-63eg.onrender.com');
      expect(parsed.protocol).toBe('https:');
      expect(parsed.pathname).toBe('/api/user-dashboard/overview');
      expect(parsed.hostname).not.toBe('chain-verify-api.onrender.com');
      expect(parsed.hostname).not.toBe('api.chainverify.org');
    }
  });

  it('preserves localhost for an unset server base and for an explicit local base', () => {
    expect(dashboardUrl('', 'overview')).toBe(
      'http://localhost:3001/api/user-dashboard/overview',
    );
    expect(dashboardUrl(undefined, 'overview')).toBe(
      'http://localhost:3001/api/user-dashboard/overview',
    );
    expect(dashboardUrl(null, 'overview')).toBe(
      'http://localhost:3001/api/user-dashboard/overview',
    );
    expect(dashboardUrl('http://localhost:3001/', 'overview')).toBe(
      'http://localhost:3001/api/user-dashboard/overview',
    );
    expect(dashboardUrl('http://127.0.0.1:3001', 'settings')).toBe(
      'http://127.0.0.1:3001/api/user-dashboard/settings',
    );
  });

  it('leaves any other configured host unchanged and keeps the scans query string', () => {
    expect(dashboardUrl('https://chain-verify-api-63eg.onrender.com/', 'billing')).toBe(
      'https://chain-verify-api-63eg.onrender.com/api/user-dashboard/billing',
    );
    expect(dashboardUrl('https://api.example.test', 'scans', 'limit=20&cursor=abc')).toBe(
      'https://api.example.test/api/user-dashboard/scans?limit=20&cursor=abc',
    );
    expect(dashboardUrl('http://localhost:3001', 'scans', 'limit=20')).toBe(
      'http://localhost:3001/api/user-dashboard/scans?limit=20',
    );
  });

  it('builds every dashboard suffix on the live host', () => {
    for (const suffix of ROUTES) {
      expect(dashboardUrl(CANONICAL_API_ORIGIN, suffix)).toBe(
        `${CANONICAL_API_ORIGIN}/api/user-dashboard/${suffix}`,
      );
    }
  });
});

describe('public API base', () => {
  it('defaults to the live host and rewrites a stale public override', () => {
    expect(resolvePublicApiBase(undefined)).toBe(CANONICAL_API_ORIGIN);
    expect(resolvePublicApiBase('')).toBe(CANONICAL_API_ORIGIN);
    expect(resolvePublicApiBase('https://chain-verify-api.onrender.com')).toBe(
      CANONICAL_API_ORIGIN,
    );
    expect(resolvePublicApiBase('https://api.chainverify.org/')).toBe(CANONICAL_API_ORIGIN);
    expect(resolvePublicApiBase('http://localhost:3001')).toBe('http://localhost:3001');
    expect(resolvePublicApiBase('https://api.example.test/')).toBe('https://api.example.test');
  });
});

describe('client modules', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the live host from constants when the public env is unset or stale', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAIN_VERIFY_API_BASE', '');
    vi.resetModules();
    const unset = await import('./constants');
    expect(unset.DEFAULT_API_BASE).toBe('https://chain-verify-api-63eg.onrender.com');

    vi.stubEnv('NEXT_PUBLIC_CHAIN_VERIFY_API_BASE', 'https://api.chainverify.org/');
    vi.resetModules();
    const stale = await import('./constants');
    expect(stale.DEFAULT_API_BASE).toBe('https://chain-verify-api-63eg.onrender.com');

    vi.stubEnv('NEXT_PUBLIC_CHAIN_VERIFY_API_BASE', 'http://localhost:3001/');
    vi.resetModules();
    const local = await import('./constants');
    expect(local.DEFAULT_API_BASE).toBe('http://localhost:3001');
  });

  it('uses the live host from proof-api outside development and keeps local dev', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.resetModules();
    const production = await import('./proof-api');
    expect(production.resolveProofApiBase()).toBe(
      'https://chain-verify-api-63eg.onrender.com',
    );

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.resetModules();
    const development = await import('./proof-api');
    expect(development.resolveProofApiBase()).toBe('http://localhost:3001');

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://chain-verify-api.onrender.com/');
    vi.resetModules();
    const stale = await import('./proof-api');
    expect(stale.resolveProofApiBase()).toBe('https://chain-verify-api-63eg.onrender.com');

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    vi.resetModules();
    const other = await import('./proof-api');
    expect(other.resolveProofApiBase()).toBe('https://api.example.test');
  });
});

describe('user-dashboard proxies', () => {
  const routesDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../app/api/proxy/user-dashboard',
  );

  it('sends every proxy through dashboardUrl and keeps the key header', () => {
    for (const suffix of ROUTES) {
      const src = readFileSync(join(routesDir, suffix, 'route.ts'), 'utf8');
      expect(src).toContain('dashboardUrl');
      expect(src).toContain(`dashboardUrl(API_BASE, '${suffix}'`);
      // Auth rides in the shared helper: every route must call it (it sends
      // the stored key first and falls back to the session cookie on a 401),
      // so no route can silently drop auth.
      expect(src).toContain('proxyFetchWithSessionFallback');
      expect(src).toContain(`proxyFetchWithSessionFallback(request, dashboardUrl(API_BASE, '${suffix}'`);
      expect(src).not.toContain('chain-verify-api.onrender.com');
      expect(src).not.toContain('api.chainverify.org');
      expect(src).not.toContain("'/user-dashboard/");
      expect(src).not.toContain('"/user-dashboard/');
    }

    // The shared helper itself still sends the stored key header (and the
    // session cookie as the 401 fallback) -- the routes inherit it from here.
    const proxyAuth = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'proxyAuth.ts'),
      'utf8',
    );
    expect(proxyAuth).toContain('x-chain-verify-api-key');
    expect(proxyAuth).toContain("Authorization: 'Bearer ' + apiKey");
    expect(proxyAuth).toContain("Authorization: 'Bearer ' + session");

    const scans = readFileSync(join(routesDir, 'scans', 'route.ts'), 'utf8');
    expect(scans).toContain('request.nextUrl.searchParams.toString()');
    expect(scans).toContain("dashboardUrl(API_BASE, 'scans', search)");
  });
});

describe('user-dashboard api-keys proxy — customer key mutations', () => {
  const routesDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../app/api/proxy/user-dashboard',
  );

  it('exposes POST create and DELETE retire through the customer proxy', () => {
    const src = readFileSync(join(routesDir, 'api-keys', 'route.ts'), 'utf8');
    expect(src).toContain('export async function POST');
    expect(src).toContain('export async function DELETE');
    expect(src).toContain("method: 'POST'");
    expect(src).toContain("method: 'DELETE'");
    // Both mutations ride the shared auth helper (stored key first, email
    // session on a 401), like GET — no mutation route can silently drop auth.
    expect(src).toContain('proxyFetchWithSessionFallback');
  });

  it('never routes customer key management through the admin endpoint', () => {
    const src = readFileSync(join(routesDir, 'api-keys', 'route.ts'), 'utf8');
    expect(src).not.toContain('/api/admin');
    expect(src).not.toContain('x-admin-key');
    expect(src).not.toContain('adminApi');
    expect(src).not.toContain('console.log');
  });
});
