// MANUAL LIVE INTEGRATION — explicitly separate from the mocked unit tests.
//
// This file is NOT a *.spec.ts and lives OUTSIDE src/, at
// apps/api/scripts/security-checks-live-integration.manual.ts,
// so `npm test` / `vitest run` in apps/api does NOT execute it, and it is
// NOT compiled into the API build (tsconfig include is src/**/*.ts only).
// It preserves, verbatim, the two genuine live GitHub-fetch calls that the
// mocked security-checks.spec.ts S6 tests replaced. Do NOT fold this file
// into the mocked test, and do NOT delete it to make the suite green.
//
// CORRECTED COPY/IMPORT INSTRUCTIONS (verified by inspecting the real
// repo layout; the previous wording only said to "adjust the import if
// the copy location differs", which is not an instruction):
//   Home location of this file:
//     apps/api/scripts/security-checks-live-integration.manual.ts
//   At that home location, the import below is CORRECT as written:
//     '../src/modules/verification/software-delivery/checks/security-checks.service.js'
//   because from apps/api/scripts/, '..' is apps/api/, and
//   apps/api/src/modules/verification/software-delivery/checks/
//   security-checks.service.js is the service file.
//   To run it live, by hand only, when a network check is actually wanted:
//   1. Copy this file to exactly:
//      apps/api/src/modules/verification/software-delivery/checks/
//      security-checks.live-tmp.spec.ts
//   2. In the COPY ONLY (never in this home file), change the import to:
//      './security-checks.service.js'
//      because the copy sits in the SAME directory as the service. The
//      home file's import would resolve from the copy to the nonexistent
//      apps/api/src/modules/verification/src/modules/verification/
//      software-delivery/checks/security-checks.service.js — do not use it
//      there.
//   3. From the apps/api directory, run only that file:
//      npx vitest run src/modules/verification/software-delivery/checks/security-checks.live-tmp.spec.ts
//   4. Delete the temporary file afterwards:
//      rm apps/api/src/modules/verification/software-delivery/checks/security-checks.live-tmp.spec.ts
//      Never commit the temporary file, and never gate the default suite
//      on this live file.
//
// CORRECTED NOTE ON FAILURE BEHAVIOUR (defect fix, separate from the
// v1.4 parser repair): at c6b5b90, a GitHub compare failure was swallowed
// and S6 reported PASS / "no new packages" — that was a confirmed defect,
// not behaviour to preserve. After the defect fix, a GitHub compare
// failure returns WARNING with incomplete-check evidence (compare
// unavailable, newPackagesChecked not established). The two live tests
// below assert only status in [PASS, WARNING], so they still pass under
// the fix; a PASS result on a failed compare would now indicate the fix
// is absent. A live run may time out under vitest's default 5000ms
// timeout because the service's axios timeout is 10000ms — that timing
// mismatch is exactly why the default suite uses mocks instead of this
// file. This file itself is NOT run in the isolated defect-fix task (no
// live calls); these instructions are for hand use only.

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SecurityChecksService } from '../src/modules/verification/software-delivery/checks/security-checks.service.js';

describe('SecurityChecksService live integration (manual only)', () => {
  let service: SecurityChecksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SecurityChecksService],
    }).compile();
    service = module.get(SecurityChecksService);
  });

  describe('checkDependencySecurity (S6) — live', () => {
    it('detects package.json at root path', async () => {
      // When package.json IS changed it tries to fetch from GitHub — we just verify it proceeds past the early exit
      // (It will return WARNING if the GitHub call fails with no token, which is expected in test env)
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      // May return PASS (no new packages extracted) or WARNING (OSV unreachable); never FAIL here
      expect(['PASS', 'WARNING']).toContain(result.status);
    });

    it('detects nested package.json via endsWith check', async () => {
      const result = await service.checkDependencySecurity(
        ['apps/web/package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(['PASS', 'WARNING']).toContain(result.status);
    });
  });
});
