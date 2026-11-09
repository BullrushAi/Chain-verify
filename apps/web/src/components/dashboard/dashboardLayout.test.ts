import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// This test sits next to the dashboard components:
// apps/web/src/components/dashboard/dashboardLayout.test.ts
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = join(HERE, '../../app/dashboard');
const SERVICE_SRC = join(
  HERE,
  '../../../../api/src/modules/user-dashboard/user-dashboard.service.ts',
);

const COMPONENTS = [
  'UserDashboard.tsx',
  'ScansDashboard.tsx',
  'ApiKeysDashboard.tsx',
  'BillingDashboard.tsx',
  'OrganizationDashboard.tsx',
];

function readComponent(name: string): string {
  return readFileSync(join(HERE, name), 'utf8');
}

describe('Task 2 — shared dashboard navigation', () => {
  it('DashboardNav carries all six sections, New scan, email, org, and Sign out', () => {
    const src = readComponent('DashboardNav.tsx');
    for (const [href, label] of [
      ['/dashboard', 'Dashboard'],
      ['/dashboard/scans', 'Scans'],
      ['/dashboard/api-keys', 'API Keys'],
      ['/dashboard/billing', 'Billing'],
      ['/dashboard/organization', 'Organization'],
      ['/dashboard/settings', 'Settings'],
    ] as const) {
      expect(src).toContain(`'${href}'`);
      expect(src).toContain(`'${label}'`);
    }
    expect(src).toContain('New scan');
    expect(src).toContain("'/invoice-proof/scan'");
    expect(src).toContain('Signed in as');
    expect(src).toContain('Sign out');
    expect(src).toContain('orgName');
    expect(src).toContain('aria-current');
  });

  it('every dashboard component and the settings page render the shared nav', () => {
    for (const name of COMPONENTS) {
      expect(readComponent(name)).toContain('<DashboardNav');
    }
    expect(readFileSync(join(PAGES_DIR, 'settings', 'page.tsx'), 'utf8')).toContain(
      '<DashboardNav',
    );
  });

  it('no dashboard page keeps a bottom nav or a back link', () => {
    for (const name of [...COMPONENTS, 'DashboardNav.tsx']) {
      const src = readComponent(name);
      expect(src).not.toContain('Quick links');
      expect(src).not.toContain('Back to Dashboard');
    }
  });

  it('home replaces the fake row-count stat with scans needing review + usage vs plan', () => {
    const src = readComponent('UserDashboard.tsx');
    expect(src).toContain('scansNeedingReview');
    expect(src).toContain('Scans needing review');
    expect(src).toContain('Usage vs plan');
    // The old fake stat was a KPI card labelled "Recent scans" holding the row count.
    expect(src).not.toContain("ipa-kpi-label'>Recent scans");
  });

  it('scan rows link into the scan detail page', () => {
    for (const name of ['UserDashboard.tsx', 'ScansDashboard.tsx']) {
      expect(readComponent(name)).toContain('/dashboard/scans/${');
      // The dashboard never links out to the vendor review page: for an
      // email session that page 401s on the empty API key and signs the
      // user out, destroying the dashboard session (Task 3, Nov 8 2026).
      expect(readComponent(name)).not.toContain('/invoice-proof/review/');
    }
  });

  it('Settings is merged into Organization, not a duplicate org table', () => {
    expect(existsSync(join(HERE, 'SettingsDashboard.tsx'))).toBe(false);
    const settingsPage = readFileSync(join(PAGES_DIR, 'settings', 'page.tsx'), 'utf8');
    expect(settingsPage).toContain("router.replace('/dashboard/organization')");
    expect(settingsPage).toContain('Settings has moved into Organization');
    const org = readComponent('OrganizationDashboard.tsx');
    expect(org).toContain('apiKeyCount');
    expect(org).toContain('Settings page now opens this page');
  });

  it('the nav has styles', () => {
    const css = readFileSync(join(PAGES_DIR, 'dashboard.css'), 'utf8');
    expect(css).toContain('.ipa-dashnav');
    expect(css).toContain('.ipa-dashnav-link');
  });

  it('the API overview carries the true scans-needing-review stat', () => {
    const src = readFileSync(SERVICE_SRC, 'utf8');
    expect(src).toContain('scansNeedingReview');
    expect(src).toContain("status: { in: ['FAILED', 'NEEDS_REVIEW'] }");
  });
});
