import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chain-verify/config', () => ({
  verifyApiPlanConfigs: [
    {
      slug: 'free',
      monthlyRuns: 10,
      overageCents: null,
      retentionDays: 7,
    },
  ],
}));

import {
  VerifyApiController,
  verifyApiRuleTestHooks as _testHooks,
} from './verify-api.controller.js';

// verifyApiRuleTestHooks is undefined in production (NODE_ENV=production) but
// always defined in test runs. Assert non-null so TypeScript is satisfied
// without spreading undefined checks through every test assertion.
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const verifyApiRuleTestHooks = _testHooks!;

// ---------------------------------------------------------------------------
// Verify-result logging (cbv-vlog1): POST /api/verify(/demo) must write ONE
// structured log line per verification run — run id, task, status, risk,
// confidence, issue count and the findings — for every 200 answer. The
// logger is mocked (spied) here; no real AI calls, no spend.
// ---------------------------------------------------------------------------
describe('VerifyApiController verify-result logging (cbv-vlog1)', () => {
  beforeEach(() => {
    verifyApiRuleTestHooks.demoIpCounters.clear();
  });

  type AiIssue = { rule: string; severity: string; message: string };

  function makeLoggingController(aiIssues: AiIssue[], llmUnavailable = false) {
    const verificationService = {
      queueVerification: vi.fn().mockResolvedValue({ id: 'run_vlog_001' }),
      // Echo the riskLevel the controller computed, like the real service
      // persists it — the response (and the log line) read it back from here.
      updateVerificationStatus: vi
        .fn()
        .mockImplementation(
          (_id: unknown, _org: unknown, _status: unknown, opts?: { riskLevel?: string }) =>
            Promise.resolve({
              riskLevel: opts?.riskLevel ?? 'LOW',
              outputSummary: 'All checks passed',
            }),
        ),
    };
    const proofService = {
      createProof: vi.fn().mockResolvedValue({
        id: 'proof_vlog_001',
        chain_hash: 'c'.repeat(64),
      }),
    };
    const prisma = {
      organizationSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
      verificationRun: {
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const aiAnalysis = {
      analyze: vi.fn().mockResolvedValue({
        llm_unavailable: llmUnavailable,
        issues: aiIssues,
        ai_summary: 'Mocked AI summary.',
        risk_assessment: 'low',
      }),
    };
    const proofClaim = { generateClaimToken: vi.fn().mockReturnValue('claim_vlog') };
    const verifyApiUsage = { reserve: vi.fn().mockResolvedValue(undefined) };
    const controller = new VerifyApiController(
      verificationService as never,
      proofService as never,
      prisma as never,
      {} as never, // proofBilling (unused for anonymous callers)
      proofClaim as never,
      aiAnalysis as never,
      {} as never, // softwareDelivery
      verifyApiUsage as never,
    );
    // The controller owns a real NestJS Logger; spy on its methods so the
    // tests assert on what was actually logged, with no log output written.
    const logger = (
      controller as unknown as {
        logger: {
          log: (...args: unknown[]) => void;
          warn: (...args: unknown[]) => void;
          error: (...args: unknown[]) => void;
        };
      }
    ).logger;
    const logSpy = vi.spyOn(logger, 'log');
    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');
    return { controller, logSpy, warnSpy, errorSpy };
  }

  function logLines(spy: { mock: { calls: unknown[][] } }): string[] {
    return spy.mock.calls.map((call) => String(call[0]));
  }

  const cleanOutput = {
    title: 'Quarterly summary',
    summary: 'All milestones met on schedule.',
  };
  it('(a) logs one structured line with the run fields on passed', async () => {
    const { controller, logSpy } = makeLoggingController([]);
    const req = { headers: {}, ip: '203.0.113.71' } as never;
    const result = (await controller.verifyDemo(
      { task: 'document', output: cleanOutput },
      req,
    )) as Record<string, unknown>;

    expect(result.status).toBe('passed');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logLines(logSpy)[0]!;
    expect(line).toContain('Verification run run_vlog_001');
    expect(line).toContain('task=document');
    expect(line).toContain('status=passed');
    expect(line).toContain('risk=low');
    expect(line).toContain('confidence=0.95');
    expect(line).toContain('issues=0');
    expect(line).toContain('findings=none');
  });

  it('(b) logs the warning finding with the right fields on needs_review', async () => {
    const { controller, logSpy } = makeLoggingController([
      {
        rule: 'missing_detail',
        severity: 'warning',
        message: 'AI found a minor gap: the summary omits the review date.',
      },
    ]);
    const req = { headers: {}, ip: '203.0.113.72' } as never;
    const result = (await controller.verifyDemo(
      { task: 'document', output: cleanOutput },
      req,
    )) as Record<string, unknown>;

    expect(result.status).toBe('needs_review');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logLines(logSpy)[0]!;
    expect(line).toContain('Verification run run_vlog_001');
    expect(line).toContain('task=document');
    expect(line).toContain('status=needs_review');
    expect(line).toContain('risk=medium');
    expect(line).toContain('confidence=0.8');
    expect(line).toContain('issues=1');
    expect(line).toContain(
      'findings=[ai:missing_detail|warning] AI found a minor gap: the summary omits the review date.',
    );
  });
  it('(c) logs the critical finding with the right fields on failed', async () => {
    const { controller, logSpy } = makeLoggingController([
      {
        rule: 'unsupported_claim',
        severity: 'critical',
        message: 'AI found an unsupported claim in the summary.',
      },
    ]);
    const req = { headers: {}, ip: '203.0.113.73' } as never;
    const result = (await controller.verifyDemo(
      { task: 'document', output: cleanOutput },
      req,
    )) as Record<string, unknown>;

    expect(result.status).toBe('failed');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logLines(logSpy)[0]!;
    expect(line).toContain('Verification run run_vlog_001');
    expect(line).toContain('task=document');
    expect(line).toContain('status=failed');
    expect(line).toContain('risk=high');
    expect(line).toContain('confidence=0.8');
    expect(line).toContain('issues=1');
    expect(line).toContain(
      'findings=[ai:unsupported_claim|critical] AI found an unsupported claim in the summary.',
    );
  });

  it('(d) never logs the document body, an email address, or an API key value', async () => {
    const secretEmail = 'secret.person@example.com';
    const secretKey = 'sk-test-0123456789abcdefghijklmnop';
    const docBody = 'Meridian quarterly finance review for the Halcyon account';
    const { controller, logSpy, warnSpy, errorSpy } = makeLoggingController([]);
    const req = { headers: {}, ip: '203.0.113.74' } as never;
    const result = (await controller.verifyDemo(
      {
        task: 'document',
        output: {
          title: 'Finance review',
          summary: `${docBody}. Contact ${secretEmail} with key ${secretKey} for questions.`,
        },
      },
      req,
    )) as Record<string, unknown>;

    // The email trips the PII detector, so the run fails — but the logged
    // finding only names the category ('email address'), never the value.
    expect(result.status).toBe('failed');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const allLogged = [
      ...logLines(logSpy),
      ...logLines(warnSpy),
      ...logLines(errorSpy),
    ].join('\n');
    expect(allLogged).not.toContain(secretEmail);
    expect(allLogged).not.toContain(secretKey);
    expect(allLogged).not.toContain(docBody);
    expect(allLogged).toContain('pii_leak_detected');
    expect(allLogged).toContain('Verification run run_vlog_001');
  });
  it('(e) logs the degraded audit_proof answer once, after the degraded warn', async () => {
    const { controller, logSpy, warnSpy } = makeLoggingController([], true);
    const req = { headers: {}, ip: '203.0.113.75' } as never;
    const result = (await controller.verifyDemo(
      {
        task: 'audit_proof',
        source_type: 'audit_proof',
        output: { title: 'Policy review', summary: 'All controls reviewed.' },
      },
      req,
    )) as Record<string, unknown>;

    expect(['passed', 'needs_review', 'failed']).toContain(result.status);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logLines(logSpy)[0]!;
    expect(line).toContain('Verification run run_vlog_001');
    expect(line).toContain('task=audit_proof');
    expect(line).toContain(`status=${result.status as string}`);
  });

  it('(f) emits no verify-result log line on the 503 LLM-unavailable path', async () => {
    const { controller, logSpy, errorSpy } = makeLoggingController([], true);
    const req = { headers: {}, ip: '203.0.113.76' } as never;
    await expect(
      controller.verifyDemo({ task: 'document', output: cleanOutput }, req),
    ).rejects.toMatchObject({ status: 503 });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
