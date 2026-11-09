import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// This test sits next to the dashboard components:
// apps/web/src/components/dashboard/scanReviewLink.test.ts
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, '../..');
const SERVICE_SRC = join(
  HERE,
  '../../../../api/src/modules/user-dashboard/user-dashboard.service.ts',
);
const CONTROLLER_SRC = join(
  HERE,
  '../../../../api/src/modules/user-dashboard/user-dashboard.controller.ts',
);

function readWeb(rel: string): string {
  return readFileSync(join(WEB_SRC, rel), 'utf8');
}

/**
 * CBV fix round Task 3 (Nov 8 2026). Live, clicking a scan row's Review
 * link navigated to /invoice-proof/review/<scan-id> — a separate
 * InvoiceProof sign-in page ("That API key was not accepted") — and
 * visiting it DESTROYED the dashboard email session: afterwards both
 * /dashboard and /dashboard/billing showed only the sign-in page.
 *
 * There is no DOM test runner in this repo, so — like dashboardLayout.test.ts
 * and noOrgEmptyState.test.ts — these tests assert on the component source.
 */
describe('Task 3 — dashboard Review links stay inside the dashboard', () => {
  it('both dashboard scan tables link Review to the in-dashboard detail page', () => {
    for (const name of ['UserDashboard.tsx', 'ScansDashboard.tsx']) {
      const src = readFileSync(join(HERE, name), 'utf8');
      expect(src).toContain('/dashboard/scans/${');
      expect(src).not.toContain('/invoice-proof/review/');
    }
  });

  it('the vendor portal still links its own tables to the vendor review page', () => {
    // The /invoice-proof/review route serves API-key users; only the
    // dashboard's Review links change. The vendor tables keep theirs.
    for (const name of ['ScanHistoryTable.tsx', 'ScanResultPanel.tsx']) {
      const src = readWeb(`components/invoice-proof/${name}`);
      expect(src).toContain('/invoice-proof/review/${');
    }
  });

  it('the in-dashboard detail page exists under the gate and the shared nav', () => {
    const pagePath = join(WEB_SRC, 'app/dashboard/scans/[id]/page.tsx');
    expect(existsSync(pagePath)).toBe(true);
    const page = readFileSync(pagePath, 'utf8');
    expect(page).toContain('<InvoiceProofKeyGate>');
    expect(page).toContain('<ScanDetailDashboard scanId={params.id} />');
    const detail = readFileSync(join(HERE, 'ScanDetailDashboard.tsx'), 'utf8');
    expect(detail).toContain("<DashboardNav current='scans' />");
    expect(detail).toContain("href='/dashboard/scans'");
  });
});

describe('Task 3 — the detail page reads the scan through the dashboard proxy', () => {
  it('the detail component fetches the single-scan proxy route', () => {
    const src = readFileSync(join(HERE, 'ScanDetailDashboard.tsx'), 'utf8');
    expect(src).toContain("'/api/proxy/user-dashboard/scans/' + encodeURIComponent(scanId)");
    expect(src).toContain("'x-chain-verify-api-key': apiKey");
    // The scan fields shown are the list's fields: nothing the list hides.
    for (const field of ['scan.product', 'scan.status', 'scan.riskLevel', 'scan.confidence', 'scan.inputSummary', 'scan.outputSummary']) {
      expect(src).toContain(field);
    }
  });

  it('a 404 is a not-found page, never an error and never a sign-out', () => {
    const src = readFileSync(join(HERE, 'ScanDetailDashboard.tsx'), 'utf8');
    expect(src).toContain('res.status === 404');
    // The 404 branch runs before the generic failure throw and sets the
    // not-found state instead of signing out.
    expect(src.indexOf('res.status === 404')).toBeLessThan(
      src.indexOf("throw new Error('Failed to load scan')"),
    );
    expect(src).toContain('setNotFound(true)');
    expect(src).toContain('Scan not found');
    expect(src).toContain("This scan doesn&apos;t exist, or it belongs to a different organization.");
    // A 404 must not call signOut anywhere near it: the only signOut in
    // the file is the 401 branch, which runs first.
    expect(src.indexOf("signOut('Session expired')")).toBeLessThan(src.indexOf('res.status === 404'));
  });

  it('an expired session still signs out from the detail page', () => {
    const src = readFileSync(join(HERE, 'ScanDetailDashboard.tsx'), 'utf8');
    expect(src).toContain('res.status === 401');
    expect(src).toContain("signOut('Session expired')");
    expect(src.indexOf('res.status === 401')).toBeLessThan(src.indexOf('res.status === 404'));
  });

  it('the single-scan proxy route uses the shared auth helper', () => {
    const route = readWeb('app/api/proxy/user-dashboard/scans/[id]/route.ts');
    expect(route).toContain('proxyFetchWithSessionFallback');
    expect(route).toContain("dashboardUrl(API_BASE, `scans/${encodeURIComponent(params.id)}`)");
    expect(route).not.toContain("'/user-dashboard/");
    expect(route).not.toContain('"/user-dashboard/');
  });
});

describe('Task 3 — the API serves one scan, scoped to the caller org', () => {
  it('getScan queries one run by id AND org, and 404s otherwise', () => {
    const svc = readFileSync(SERVICE_SRC, 'utf8');
    expect(svc).toContain('async getScan(organizationId: OrganizationId, scanId: string)');
    expect(svc.slice(svc.indexOf('async getScan'))).toContain('requireOrganizationId');
    expect(svc).toContain('where: { id: scanId, orgId }');
    expect(svc).toContain("throw new NotFoundException('Scan not found')");
    // Detail shows exactly the list's fields — one shared select.
    expect(svc).toContain('const SCAN_SELECT');
    expect(svc.indexOf('select: SCAN_SELECT')).toBeGreaterThan(-1);
  });

  it('the controller exposes GET scans/:id, scoped to the session org', () => {
    const ctrl = readFileSync(CONTROLLER_SRC, 'utf8');
    expect(ctrl).toContain("@Get('scans/:id')");
    expect(ctrl).toContain('getScan(@Req() req: any, @Param(\'id\') id: string)');
    expect(ctrl).toContain('return this.svc.getScan(orgId, id);');
  });
});

describe('Task 3 — visiting the vendor review page cannot kill an email session', () => {
  it('an email session is never signed out by a review 401/403', () => {
    const src = readWeb('components/invoice-proof/ScanReview.tsx');
    // The guard runs inside the 401/403 branch, before the signOut call.
    expect(src).toContain("authKind === 'email'");
    expect(src.indexOf("authKind === 'email'")).toBeLessThan(
      src.indexOf("signOut('That API key was not accepted."),
    );
    expect(src).toContain('setError(');
    expect(src).toContain('Your email sign-in is still active');
    // And the page offers the in-dashboard detail instead.
    expect(src).toContain('`/dashboard/scans/${scanId}`');
    expect(src).toContain('Open this scan in your dashboard');
  });

  it('an API-key session still signs out on a rejected key', () => {
    const src = readWeb('components/invoice-proof/ScanReview.tsx');
    expect(src).toContain("signOut('That API key was not accepted. Check the key and try again.');");
    expect(src).toContain('Back to dashboard');
    expect(src).toContain("href=\"/invoice-proof/dashboard\"");
  });
});
