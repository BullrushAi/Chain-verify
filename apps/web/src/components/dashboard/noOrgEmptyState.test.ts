import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// This test sits next to the dashboard components:
// apps/web/src/components/dashboard/noOrgEmptyState.test.ts
const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_SRC = join(
  HERE,
  '../../../../api/src/modules/user-dashboard/user-dashboard.service.ts',
);

function readComponent(name: string): string {
  return readFileSync(join(HERE, name), 'utf8');
}

/**
 * CBV fix round Task 2 (Nov 8 2026). Live, dashboard home failed 3x
 * ("Failed to load dashboard") and Organization failed 2x ("Failed to load
 * organization") for a brand-new email sign-up with no org. The API answers
 * those two calls with 404 'Organization not found' for a no-org session
 * (Task 1 contract — single-org endpoints throw, list endpoints return
 * empty). The pages must treat that 404 as a clean empty state, not an
 * error, while a normal org session still loads with its true stats.
 * There is no DOM test runner in this repo, so — like dashboardLayout.test.ts
 * — these tests assert on the component source.
 */
describe('Task 2 — dashboard home loads for a no-org session', () => {
  it('a 404 from overview renders an empty dashboard, not an error', () => {
    const src = readComponent('UserDashboard.tsx');
    // The 404 branch runs before the generic failure throw.
    expect(src.indexOf('res.status === 404')).toBeGreaterThan(-1);
    expect(src.indexOf('res.status === 404')).toBeLessThan(
      src.indexOf("throw new Error('Failed to load dashboard')"),
    );
    // The empty state is a zeroed overview with no org — the normal render
    // path then shows 0 counts and 'No scans yet.' instead of an error.
    expect(src).toContain('organization: null');
    expect(src).toContain('activeApiKeyCount: 0');
    expect(src).toContain('verificationRunsThisMonth: 0');
    expect(src).toContain('recentRuns: []');
    expect(src).toContain('No organization linked to this account yet.');
  });

  it('the no-org overview cannot crash on a missing organization', () => {
    const src = readComponent('UserDashboard.tsx');
    expect(src).toContain('organization: { id: string; name: string; slug: string; createdAt: string } | null');
    expect(src).toContain('overview?.organization?.name');
    expect(src).toContain('overview.organization ? ');
  });

  it('a normal session still loads with its true stats', () => {
    const src = readComponent('UserDashboard.tsx');
    expect(src).toContain('setOverview(await res.json())');
    expect(src).toContain('scansNeedingReview');
    expect(src).toContain('Scans needing review');
    expect(src).toContain('Usage vs plan');
    // Other failures still error, and an expired session still signs out.
    expect(src).toContain("throw new Error('Failed to load dashboard')");
    expect(src.indexOf('res.status === 401')).toBeLessThan(src.indexOf('res.status === 404'));
  });
});

describe('Task 2 — Organization page loads for a no-org session', () => {
  it('a 404 from organization renders an empty state, not an error', () => {
    const src = readComponent('OrganizationDashboard.tsx');
    // The 404 branch runs before the generic failure throw.
    expect(src.indexOf('res.status === 404')).toBeGreaterThan(-1);
    expect(src.indexOf('res.status === 404')).toBeLessThan(
      src.indexOf("throw new Error('Failed to load organization')"),
    );
    expect(src).toContain('setNoOrg(true)');
    expect(src).toContain('if (noOrg)');
    expect(src).toContain('No organization linked to this account yet.');
    expect(src).toContain('Once your email is linked to an organization, its details will appear here.');
    // A later load (e.g. Retry after the email is linked) clears the flag.
    expect(src).toContain('setNoOrg(false)');
  });

  it('the settings fetch cannot break the page for a no-org session', () => {
    const src = readComponent('OrganizationDashboard.tsx');
    // Skipped outright: the 404 early-return runs before the settings fetch.
    expect(src.indexOf('res.status === 404')).toBeLessThan(
      src.indexOf("/api/proxy/user-dashboard/settings"),
    );
    // And it is guarded anyway: a non-ok settings response only hides the row.
    expect(src).toContain('if (settingsRes.ok)');
  });

  it('a normal session still loads the organization table', () => {
    const src = readComponent('OrganizationDashboard.tsx');
    expect(src).toContain('setOrg(await res.json())');
    expect(src).toContain('{org.name}');
    expect(src).toContain('apiKeyCount');
    expect(src).toContain("throw new Error('Failed to load organization')");
    expect(src.indexOf('res.status === 401')).toBeLessThan(src.indexOf('res.status === 404'));
  });
});

describe('Task 2 — API contract behind the empty states', () => {
  it('overview / organization still 404 for a no-org session (Task 1 contract)', () => {
    const svc = readFileSync(SERVICE_SRC, 'utf8');
    expect(svc).toContain("throw new NotFoundException('Organization not found')");
    // The single-org getters still require an org id; only list endpoints
    // return empty shapes. The pages above consume that 404 as empty state.
    for (const method of ['getOverview', 'getOrganization', 'getSettings']) {
      expect(svc.indexOf(method)).toBeGreaterThan(-1);
      expect(svc.slice(svc.indexOf(method))).toContain('requireOrganizationId');
    }
  });
});
