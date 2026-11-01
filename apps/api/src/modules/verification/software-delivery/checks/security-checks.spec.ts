import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { SecurityChecksService } from './security-checks.service.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('SecurityChecksService', () => {
  let service: SecurityChecksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SecurityChecksService],
    }).compile();
    service = module.get(SecurityChecksService);
  });

  describe('checkNoHardcodedSecrets (S3)', () => {
    it('returns PASS when no secrets in diff', async () => {
      const diff = `
+const foo = 'bar';
+function hello() { return 'world'; }
`;
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.checkId).toBe('S3');
      expect(result.status).toBe('PASS');
      expect(result.detail).toBeUndefined();
    });

    it('returns FAIL when Stripe live key found in added lines', async () => {
      const diff = `
+const apiKey = 'sk_live_ABCDEFGHIJKLMNOPQRSTUVWX';
`;
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.checkId).toBe('S3');
      expect(result.status).toBe('FAIL');
      expect(result.detail).toContain('Stripe live key');
    });

    it('returns FAIL when Stripe test key found in added lines', async () => {
      const diff = `
+const key = 'sk_test_ABCDEFGHIJKLMNOPQRSTUVWX';
`;
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.checkId).toBe('S3');
      expect(result.status).toBe('FAIL');
      expect(result.detail).toContain('Stripe test key');
    });

    it('returns FAIL when AWS access key found', async () => {
      const diff = '+const awsKey = "AKIAIOSFODNN7EXAMPLE";';
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.checkId).toBe('S3');
      expect(result.status).toBe('FAIL');
    });

    it('returns FAIL when GitHub PAT found in added lines', async () => {
      // ghp_ + 36 alphanum chars
      const diff = '+const token = "ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";';
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.status).toBe('FAIL');
    });

    it('does NOT flag secrets in removed lines (- prefix)', async () => {
      // Removing a hardcoded secret is a good change — must not be flagged
      const diff = `-const oldKey = 'sk_live_ABCDEFGHIJKLMNOPQRSTUVWX';`;
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.checkId).toBe('S3');
      expect(result.status).toBe('PASS');
    });

    it('does NOT flag secrets on diff header lines (+++ prefix)', async () => {
      // +++ lines are file path headers in unified diff format, not added code
      const diff = `+++ b/src/sk_live_ABCDEFGHIJKLMNOPQRSTUVWX.ts`;
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.status).toBe('PASS');
    });

    it('returns SKIP when diff text is empty string', async () => {
      const result = await service.checkNoHardcodedSecrets('');
      expect(result.checkId).toBe('S3');
      expect(result.status).toBe('SKIP');
    });

    it('evidence block includes patternsChecked and matchesFound counts on FAIL', async () => {
      const diff = '+const k = "sk_live_ABCDEFGHIJKLMNOPQRSTUVWX";';
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.evidence).toBeDefined();
      expect((result.evidence as any).patternsChecked).toBeGreaterThan(0);
      expect((result.evidence as any).matchesFound).toBeGreaterThan(0);
    });

    it('evidence block shows zero matchesFound on PASS', async () => {
      const diff = '+const greeting = "hello world";';
      const result = await service.checkNoHardcodedSecrets(diff);
      expect(result.status).toBe('PASS');
      expect((result.evidence as any).matchesFound).toBe(0);
    });
  });

  describe('checkDependencySecurity (S6)', () => {
    // Deterministic unit tests: axios is mocked at module level (see vi.mock
    // at the top of this file), so no test in this describe block touches
    // the network. The genuine live calls are preserved verbatim,
    // explicitly separate, in
    // apps/api/scripts/security-checks-live-integration.manual.ts (outside
    // src/, not a *.spec.ts, so `vitest run` does not execute it).
    //
    // DEFECT FIX (separate from the v1.4 parser repair): the baseline
    // service swallowed a GitHub compare failure in extractNewPackages and
    // returned [], which S6 then reported as PASS / "no new packages".
    // That characterisation was the defect, not behaviour to preserve.
    // After the fix, an unavailable compare (fetch failure, timeout, or
    // malformed response) returns WARNING with incomplete-check evidence,
    // while a successfully inspected empty set still returns PASS.
    beforeEach(() => {
      mockedAxios.get.mockReset();
      mockedAxios.post.mockReset();
    });

    it('returns PASS when no package.json change', async () => {
      const result = await service.checkDependencySecurity(
        ['src/foo.ts', 'src/bar.ts'],
        'owner', 'repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('PASS');
      expect(result.detail).toContain('No package.json changes');
    });

    it('returns PASS when nested package.json path is not present in changed files', async () => {
      const result = await service.checkDependencySecurity(
        ['apps/api/src/main.ts', 'README.md'],
        'owner', 'repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('PASS');
    });

    it('detects package.json at root path', async () => {
      // Mocked GitHub compare returns one new package; mocked OSV returns
      // no vulnerabilities. Original assertions preserved: checkId S6 and
      // status in [PASS, WARNING] (the mocked success path returns PASS).
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'package.json',
              patch: '+  "newpkg": "1.2.3",\n',
            },
          ],
        },
      } as any);
      mockedAxios.post.mockResolvedValue({
        data: { results: [{ vulns: [] }] },
      } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      // May return PASS (no new packages extracted) or WARNING (OSV unreachable); never FAIL here
      expect(['PASS', 'WARNING']).toContain(result.status);
      expect(result.status).toBe('PASS');
      expect((result.evidence as any).newPackagesChecked).toBe(1);
    });

    it('detects nested package.json via endsWith check', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'apps/web/package.json',
              patch: '+  "nestedpkg": "2.0.0",\n',
            },
          ],
        },
      } as any);
      mockedAxios.post.mockResolvedValue({
        data: { results: [{ vulns: [] }] },
      } as any);
      const result = await service.checkDependencySecurity(
        ['apps/web/package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(['PASS', 'WARNING']).toContain(result.status);
      expect((result.evidence as any).newPackagesChecked).toBe(1);
    });

    it('returns FAIL when OSV reports a HIGH advisory for a new package', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'package.json',
              patch: '+  "vulnpkg": "1.0.0",\n',
            },
          ],
        },
      } as any);
      mockedAxios.post.mockResolvedValue({
        data: {
          results: [
            {
              vulns: [
                {
                  id: 'GHSA-xxxx-yyyy-zzzz',
                  database_specific: { severity: 'HIGH' },
                },
              ],
            },
          ],
        },
      } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('FAIL');
      expect(result.detail).toContain('vulnpkg');
      expect(result.detail).toContain('GHSA-xxxx-yyyy-zzzz');
    });

    it('returns WARNING when the OSV query times out', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'package.json',
              patch: '+  "timeoutpkg": "3.0.0",\n',
            },
          ],
        },
      } as any);
      mockedAxios.post.mockRejectedValue(new Error('timeout of 10000ms exceeded'));
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('OSV');
    });

    it('returns WARNING with incomplete-check evidence when the GitHub compare fails', async () => {
      // REPLACED expectation (defect fix): the baseline returned PASS /
      // "no new packages" here because extractNewPackages swallowed the
      // failure and returned []. A failed compare means the check did not
      // run to completion, so it must be WARNING with incomplete evidence
      // — never PASS, and never "no new packages".
      mockedAxios.get.mockRejectedValue(new Error('Request failed with status code 404'));
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('incomplete');
      expect(result.detail).toContain('compare');
      expect(result.detail).not.toContain('no new packages');
      expect((result.evidence as any).checkIncomplete).toBe(true);
      expect((result.evidence as any).compareAvailable).toBe(false);
      // Not established — deliberately null, never 0 ("0 inspected").
      expect((result.evidence as any).newPackagesChecked).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns WARNING with incomplete-check evidence when the GitHub compare times out', async () => {
      mockedAxios.get.mockRejectedValue(new Error('timeout of 10000ms exceeded'));
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('incomplete');
      expect((result.evidence as any).checkIncomplete).toBe(true);
      expect((result.evidence as any).compareAvailable).toBe(false);
      expect((result.evidence as any).newPackagesChecked).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns WARNING with incomplete-check evidence when the GitHub compare response is malformed', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { files: 'not-an-array' },
      } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('incomplete');
      expect((result.evidence as any).checkIncomplete).toBe(true);
      expect((result.evidence as any).compareAvailable).toBe(false);
      expect((result.evidence as any).newPackagesChecked).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    // S6 RETURN correction: malformed files entries and malformed
    // package patches must be WARNING with incomplete evidence, never
    // PASS and never a thrown TypeError. Parameterized so each shape is
    // asserted separately: WARNING, incomplete evidence, and no OSV call.
    it.each([
      ['null entry', [null]],
      ['empty-object entry', [{}]],
      ['number entry', [42]],
      ['non-string filename', [{ filename: 42 }]],
      ['empty filename', [{ filename: '' }]],
      ['malformed entry alongside a valid entry', [{ filename: 'package.json', patch: '+  "okpkg": "1.0.0",\n' }, null]],
    ])('returns WARNING for malformed files entry: %s', async (_label, files) => {
      mockedAxios.get.mockResolvedValue({ data: { files } } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('incomplete');
      expect(result.detail).not.toContain('no new packages');
      expect((result.evidence as any).checkIncomplete).toBe(true);
      expect((result.evidence as any).compareAvailable).toBe(false);
      expect((result.evidence as any).newPackagesChecked).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it.each([
      ['number patch', 42],
      ['object patch', {}],
      ['array patch', []],
      ['empty-string patch', ''],
      ['missing patch', undefined],
    ])('returns WARNING for malformed package patch: %s', async (_label, patch) => {
      mockedAxios.get.mockResolvedValue({
        data: { files: [{ filename: 'package.json', patch }] },
      } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('incomplete');
      expect(result.detail).not.toContain('no new packages');
      expect((result.evidence as any).checkIncomplete).toBe(true);
      expect((result.evidence as any).compareAvailable).toBe(false);
      expect((result.evidence as any).newPackagesChecked).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns PASS for a genuinely inspected empty compare (no package.json file)', async () => {
      // Contrast with the WARNING cases above: the compare WAS fetched
      // and parsed, and it contains no package.json file — a successfully
      // inspected empty set, so PASS is correct here.
      mockedAxios.get.mockResolvedValue({
        data: { files: [] },
      } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('PASS');
      expect(result.detail).toContain('no new packages');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns PASS for a genuinely inspected compare with only metadata changes', async () => {
      // The patch was inspected; its only added line is a metadata key,
      // which is not a dependency — so the inspected set is empty.
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'package.json',
              patch: '+  "description": "new description",\n',
            },
          ],
        },
      } as any);
      const result = await service.checkDependencySecurity(
        ['package.json'],
        'nonexistent-owner', 'nonexistent-repo', 'abc', 'def',
      );
      expect(result.checkId).toBe('S6');
      expect(result.status).toBe('PASS');
      expect(result.detail).toContain('no new packages');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('checkNoHardcodedCredentials (INT1)', () => {
    it('returns PASS when no credentials in diff', async () => {
      const diff = `+const config = { host: 'localhost', port: 5432 };`;
      const result = await service.checkNoHardcodedCredentials(diff);
      expect(result.checkId).toBe('INT1');
      expect(result.status).toBe('PASS');
    });

    it('returns FAIL when Stripe live key found in added line', async () => {
      const diff = `+stripe.init('sk_live_ABCDEFGHIJKLMNOPQRSTUVWX')`;
      const result = await service.checkNoHardcodedCredentials(diff);
      expect(result.checkId).toBe('INT1');
      expect(result.status).toBe('FAIL');
    });

    it('returns SKIP when diff is empty', async () => {
      const result = await service.checkNoHardcodedCredentials('');
      expect(result.checkId).toBe('INT1');
      expect(result.status).toBe('SKIP');
    });

    it('does not flag credentials in removed lines', async () => {
      const diff = `-const secret = 'sk_live_ABCDEFGHIJKLMNOPQRSTUVWX';`;
      const result = await service.checkNoHardcodedCredentials(diff);
      expect(result.status).toBe('PASS');
    });

    it('evidence block includes matchedPatterns on FAIL', async () => {
      const diff = `+const k = 'sk_live_ABCDEFGHIJKLMNOPQRSTUVWX';`;
      const result = await service.checkNoHardcodedCredentials(diff);
      expect(result.evidence).toBeDefined();
      expect((result.evidence as any).matchedPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('checkRealCredentials (INT2)', () => {
    it('returns PASS when STRIPE_SECRET_KEY env var is not set', async () => {
      const original = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      const result = await service.checkRealCredentials(undefined);

      expect(result.checkId).toBe('INT2');
      expect(result.status).toBe('PASS');

      // Restore
      if (original !== undefined) process.env.STRIPE_SECRET_KEY = original;
    });

    it('returns PASS when STRIPE_SECRET_KEY is a live key', async () => {
      const original = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = 'sk_live_someProductionKeyHere';

      const result = await service.checkRealCredentials(undefined);

      expect(result.checkId).toBe('INT2');
      expect(result.status).toBe('PASS');

      if (original !== undefined) process.env.STRIPE_SECRET_KEY = original;
      else delete process.env.STRIPE_SECRET_KEY;
    });

    it('returns WARNING when STRIPE_SECRET_KEY is a test key', async () => {
      const original = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = 'sk_test_someTestKeyHere';

      const result = await service.checkRealCredentials(undefined);

      expect(result.checkId).toBe('INT2');
      expect(result.status).toBe('WARNING');
      expect(result.detail).toContain('sk_test_');

      if (original !== undefined) process.env.STRIPE_SECRET_KEY = original;
      else delete process.env.STRIPE_SECRET_KEY;
    });

    it('returns WARNING with a deployUrl argument — check is env-based, not URL-based', async () => {
      const original = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = 'sk_test_anotherTestKey';

      const result = await service.checkRealCredentials('https://example.com');

      expect(result.status).toBe('WARNING');

      if (original !== undefined) process.env.STRIPE_SECRET_KEY = original;
      else delete process.env.STRIPE_SECRET_KEY;
    });
  });
});
