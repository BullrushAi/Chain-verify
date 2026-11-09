import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// This test sits next to the dashboard components:
// apps/web/src/components/dashboard/vendorEmailSessionGuard.test.ts
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, '../..');

function readVendor(rel: string): string {
  return readFileSync(join(WEB_SRC, `components/invoice-proof/${rel}`), 'utf8');
}

const SIGN_OUT_CALL =
  "signOut('That API key was not accepted. Check the key and try again.');";
const EMAIL_GUARD = "authKind === 'email'";
const EMAIL_KEPT = 'Your email sign-in is still active';
const DASHBOARD_LINK = 'href="/dashboard/scans"';
const DASHBOARD_LINK_TEXT = 'Open your scans in your dashboard';

/**
 * CBV fix round Task 3b (Nov 8 2026). Task 3 guarded ScanReview, but the
 * session-kill was still reachable from the dashboard: every dashboard page
 * renders DashboardNav ("New scan" -> /invoice-proof/scan), and
 * /invoice-proof/dashboard IS gate-wrapped and admits the email session — so
 * InvoiceProofDashboard mounted and its load() killed the email session on
 * mount with a 401. ErpIntegrationsPanel killed the same way on mount, and
 * DataImportPanel on an import 401/403.
 *
 * There is no DOM test runner in this repo, so — like scanReviewLink.test.ts —
 * these tests assert on the component source.
 */
const COMPONENTS = [
  'InvoiceProofDashboard.tsx',
  'ErpIntegrationsPanel.tsx',
  'DataImportPanel.tsx',
] as const;

describe('Task 3b — a 401/403 never signs out an email session', () => {
  for (const name of COMPONENTS) {
    it(`${name}: the email guard runs before the signOut call`, () => {
      const src = readVendor(name);
      expect(src).toContain(EMAIL_GUARD);
      expect(src).toContain(SIGN_OUT_CALL);
      // The guard runs inside the 401/403 branch, before the signOut call.
      expect(src.indexOf(EMAIL_GUARD)).toBeLessThan(src.indexOf(SIGN_OUT_CALL));
      expect(src).toContain(EMAIL_KEPT);
    });

    it(`${name}: an email session gets an error and a dashboard link instead`, () => {
      const src = readVendor(name);
      expect(src).toContain(DASHBOARD_LINK);
      expect(src).toContain(DASHBOARD_LINK_TEXT);
    });

    it(`${name}: an API-key session still signs out on a rejected key`, () => {
      const src = readVendor(name);
      // Exactly one sign-out-on-401 call, and it is the old message.
      expect(src).toContain(SIGN_OUT_CALL);
      expect(src.split(SIGN_OUT_CALL).length - 1).toBe(1);
    });
  }

  it('all three components read authKind from the session', () => {
    for (const name of COMPONENTS) {
      const src = readVendor(name);
      expect(src).toContain('authKind');
      expect(src).toContain('useInvoiceProofSession()');
    }
  });
});

describe('Task 3b — the guards cover the live kill paths', () => {
  it('InvoiceProofDashboard loads scans on mount, through the guarded load', () => {
    const src = readVendor('InvoiceProofDashboard.tsx');
    expect(src).toContain('invoiceProofApi.listScans(apiKey)');
    expect(src).toContain('void load();');
    expect(src).toContain('err.status === 401');
    expect(src).toContain('err.status === 403');
  });

  it('ErpIntegrationsPanel lists connections on mount through the guarded handleError', () => {
    const src = readVendor('ErpIntegrationsPanel.tsx');
    expect(src).toContain('invoiceProofApi');
    expect(src).toContain('.listErpConnections(apiKey)');
    expect(src).toContain('.catch((err: unknown) => handleError(err,');
    // The connect action shares the same guarded handler.
    expect(src).toContain(
      'handleError(err, `Could not start the ${provider.label} connection.`)',
    );
  });

  it('DataImportPanel imports through the guarded runImport', () => {
    const src = readVendor('DataImportPanel.tsx');
    expect(src).toContain('invoiceProofApi.importCsv(apiKey, kind, values[kind])');
    expect(src).toContain('onImport={() => void runImport(section.kind)}');
  });
});
