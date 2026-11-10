import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// This test sits next to the dashboard components:
// apps/web/src/components/dashboard/scanDetailFindings.test.ts
const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_SRC = join(
  HERE,
  '../../../../api/src/modules/user-dashboard/user-dashboard.service.ts',
);

function readDetail(): string {
  return readFileSync(join(HERE, 'ScanDetailDashboard.tsx'), 'utf8');
}

/**
 * Scan-detail fix round (Nov 9 2026). Live, the detail page showed only the
 * summary "1 finding(s), 0 critical" (the run's outputSummary) — the
 * individual finding text never reached the page because getScan selected
 * only summary fields. The stored findings live on the run as
 * VerificationRun.issuesFound (written by createScanProofRecord).
 *
 * There is no DOM test runner in this repo, so — like scanReviewLink.test.ts
 * — these tests assert on the component + service source.
 */
describe('Scan detail — the detail page shows the individual finding text', () => {
  it('getScan selects the stored findings; the list select does not', () => {
    const svc = readFileSync(SERVICE_SRC, 'utf8');
    expect(svc).toContain('const SCAN_DETAIL_SELECT');
    expect(svc).toContain('issuesFound: true');
    expect(svc).toContain('select: SCAN_DETAIL_SELECT');
    // The list keeps the light select: no finding payload on list rows.
    expect(svc).toContain('select: SCAN_SELECT');
    const detailSelect = svc.slice(svc.indexOf('const SCAN_DETAIL_SELECT'));
    expect(detailSelect).toContain('...SCAN_SELECT');
    expect(detailSelect).toContain('issuesFound: true');
  });

  it('the detail component renders the stored findings', () => {
    const src = readDetail();
    expect(src).toContain('issuesFound');
    expect(src).toContain('normalizeFindings(scan.issuesFound)');
    expect(src).toContain("Findings ({findings.length})");
    // Both stored shapes render: proof-core findings (pattern/detail/rows)
    // and /verify rule issues (rule/message).
    expect(src).toContain('findingTitle(finding)');
    expect(src).toContain('findingDetail(finding)');
    expect(src).toContain('finding.rows');
    expect(src).toContain('finding.evidence');
    expect(src).toContain('No individual findings recorded for this scan.');
  });

  it('an empty finding list renders an honest empty state, not a crash', () => {
    const src = readDetail();
    expect(src).toContain('findings.length === 0');
    expect(src).toContain('normalizeFindings');
    // Missing field (older API build) normalizes to an empty list.
    expect(src).toContain('if (!Array.isArray(raw)) return [];');
  });
});
