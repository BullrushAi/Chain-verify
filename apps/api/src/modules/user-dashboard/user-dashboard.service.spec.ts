import { describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../../common/utils/api-key-hash.js';
import type { PrismaService } from '../database/prisma.service.js';
import { UserDashboardService } from './user-dashboard.service.js';

const ORG = {
  id: 'org-test',
  name: 'Throwaway Test Org',
  slug: 'throwaway-test-org',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** Mirrors real Prisma: a `select` clause narrows the returned shape. */
function applySelect<T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>): T {
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as T;
}

function fakePrisma() {
  const store = new Map<string, Record<string, unknown>>();
  let idCounter = 0;
  // Verification runs + entitlements seeded by the tenant-isolation tests.
  // They stand in for another org's rows (never real Aptria data).
  const runs: Array<Record<string, unknown>> = [];
  const entitlements: Array<Record<string, unknown>> = [];
  const apiIdentity = {
    findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
      const row = store.get(where.id);
      return row ? applySelect(row, select) : null;
    }),
    findMany: vi.fn(
      async ({ where, select }: { where: { organizationId: string }; select?: Record<string, boolean> }) => {
        // Mirror real Prisma: an `undefined` filter value is dropped, so the
        // query runs unscoped and returns every org's rows. The service must
        // never pass an undefined org id here (see the no-org tests below).
        const rows =
          where.organizationId === undefined
            ? Array.from(store.values())
            : Array.from(store.values()).filter((row) => row.organizationId === where.organizationId);
        return rows.map((row) => applySelect(row, select));
      },
    ),
    create: vi.fn(
      async ({ data }: { data: { organizationId: string; label: string | null; apiKeyHash: string } }) => {
        const row = {
          id: `key-${++idCounter}`,
          organizationId: data.organizationId,
          label: data.label,
          apiKeyHash: data.apiKeyHash,
          active: true,
          lastUsedAt: null,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        };
        store.set(row.id, row);
        return row;
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Partial<{ active: boolean }>;
        select?: Record<string, boolean>;
      }) => {
        const row = store.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return applySelect(row, select);
      },
    ),
    count: vi.fn().mockResolvedValue(2),
  };
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue(ORG) },
    apiIdentity,
    verificationRun: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn(
        async (args: {
          where?: { orgId?: string };
          take?: number;
          cursor?: { id: string };
          select?: Record<string, boolean>;
        }) => {
          // Mirror real Prisma: an `undefined` org filter is dropped and
          // the query returns every org's runs.
          const scoped =
            args?.where?.orgId === undefined ? runs : runs.filter((row) => row.orgId === args.where?.orgId);
          const sorted = [...scoped].sort(
            (a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime(),
          );
          let rows = sorted;
          if (args?.cursor?.id) {
            const at = rows.findIndex((row) => row.id === args.cursor?.id);
            if (at >= 0) rows = rows.slice(at + 1);
          }
          return rows.slice(0, args?.take ?? rows.length).map((row) => applySelect(row, args?.select));
        },
      ),
      findFirst: vi.fn(
        async (args: {
          where?: { id?: string; orgId?: string };
          select?: Record<string, boolean>;
        }) => {
          // Mirror real Prisma: an `undefined` org filter is dropped and
          // the query runs unscoped. The service must never pass an
          // undefined org id here (see the no-org tests below).
          const scoped =
            args?.where?.orgId === undefined ? runs : runs.filter((row) => row.orgId === args.where?.orgId);
          const row = scoped.find((r) => r.id === args?.where?.id);
          return row ? applySelect(row, args?.select) : null;
        },
      ),
      groupBy: vi.fn(async (args: { where?: { orgId?: string; createdAt?: unknown }; by?: string[] }) => {
        // Mirror real Prisma: an `undefined` org filter is dropped.
        const scoped =
          args?.where?.orgId === undefined ? runs : runs.filter((row) => row.orgId === args.where?.orgId);
        const byProduct = new Map<string, number>();
        for (const row of scoped) {
          byProduct.set(row.product as string, (byProduct.get(row.product as string) ?? 0) + 1);
        }
        return Array.from(byProduct.entries()).map(([product, count]) => ({
          product,
          _count: { _all: count },
        }));
      }),
    },
    proofProductEntitlement: {
      findMany: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
        // Mirror real Prisma: an `undefined` filter value is dropped.
        return where.organizationId === undefined
          ? entitlements
          : entitlements.filter((row) => row.organizationId === where.organizationId);
      }),
    },
  };
  return { prisma, store, runs, entitlements, apiIdentity };
}

describe('UserDashboardService.getOverview', () => {
  it('returns a true scans-needing-review count (FAILED + NEEDS_REVIEW only)', async () => {
    const { prisma } = fakePrisma();
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const overview = await svc.getOverview('org-test');
    expect(overview.scansNeedingReview).toBe(3);
    const reviewCountCall = prisma.verificationRun.count.mock.calls.find(
      (call) => (call[0] as any)?.where?.status?.in,
    );
    expect(reviewCountCall).toBeDefined();
    expect((reviewCountCall as any)[0].where).toEqual({
      orgId: 'org-test',
      status: { in: ['FAILED', 'NEEDS_REVIEW'] },
    });
  });

  it('keeps the existing overview fields', async () => {
    const { prisma } = fakePrisma();
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const overview = await svc.getOverview('org-test');
    expect(overview.organization.name).toBe('Throwaway Test Org');
    expect(overview.activeApiKeyCount).toBe(2);
    expect(overview.verificationRunsThisMonth).toBe(3);
    expect(overview.recentRuns).toEqual([]);
  });

  it('throws when the organization does not exist', async () => {
    const { prisma } = fakePrisma();
    prisma.organization.findUnique.mockResolvedValue(null);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getOverview('org-missing')).rejects.toThrow('Organization not found');
  });
});

describe('UserDashboardService.createApiKey', () => {
  it('returns the raw key exactly once and stores only its hash', async () => {
    const { prisma, store, apiIdentity } = fakePrisma();
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    const result = await svc.createApiKey('org-test', 'CI pipeline');

    expect(result.apiKey).toMatch(/^cv_live_[0-9a-f]{64}$/);
    expect(result.warning).toContain('will not be shown again');
    expect(result.organizationId).toBe('org-test');
    expect(result.label).toBe('CI pipeline');
    expect(result).not.toHaveProperty('apiKeyHash');

    const stored = Array.from(store.values());
    expect(stored).toHaveLength(1);
    expect(stored[0].apiKeyHash).toBe(sha256Hex(result.apiKey));
    expect(stored[0].apiKeyHash).not.toBe(result.apiKey);
    expect(apiIdentity.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-test', label: 'CI pipeline', apiKeyHash: sha256Hex(result.apiKey) },
    });
  });

  it('trims the label and stores an empty label as null', async () => {
    const { prisma, apiIdentity } = fakePrisma();
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    const result = await svc.createApiKey('org-test', '   ');
    expect(result.label).toBeNull();
    expect((apiIdentity.create.mock.calls[0][0] as any).data.label).toBeNull();
  });

  it('404s for an unknown organization and never mints a key', async () => {
    const { prisma, apiIdentity } = fakePrisma();
    prisma.organization.findUnique.mockResolvedValue(null);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    await expect(svc.createApiKey('org-missing', 'label')).rejects.toThrow('Organization not found');
    expect(apiIdentity.create).not.toHaveBeenCalled();
  });
});

describe('UserDashboardService.getApiKeys', () => {
  it('never returns key material in list responses', async () => {
    const { prisma, store, apiIdentity } = fakePrisma();
    store.set('key-1', {
      id: 'key-1',
      organizationId: 'org-test',
      label: 'Prod',
      apiKeyHash: 'deadbeef-hash-that-must-never-leave',
      active: true,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    const keys = await svc.getApiKeys('org-test');

    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toHaveProperty('apiKeyHash');
    expect(keys[0]).not.toHaveProperty('apiKey');
    const select = (apiIdentity.findMany.mock.calls[0][0] as any).select;
    expect(select).toBeDefined();
    expect(select.apiKeyHash).toBeUndefined();
    expect(select.apiKey).toBeUndefined();
  });
});

describe('UserDashboardService.revokeApiKey', () => {
  function seedKey(store: Map<string, Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
    const row = {
      id: 'key-1',
      organizationId: 'org-test',
      label: 'Prod',
      apiKeyHash: 'hash-1',
      active: true,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    store.set(row.id as string, row);
    return row;
  }

  it('deactivates the caller\u2019s own key and returns safe fields only', async () => {
    const { prisma, store, apiIdentity } = fakePrisma();
    seedKey(store);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    const revoked = await svc.revokeApiKey('org-test', 'key-1');

    expect(revoked.active).toBe(false);
    expect(revoked).not.toHaveProperty('apiKeyHash');
    expect(apiIdentity.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { active: false },
      select: expect.objectContaining({ id: true, label: true }),
    });
    expect(store.get('key-1')).toBeDefined(); // never deleted
  });

  it('404s for another organization\u2019s key and never touches it', async () => {
    const { prisma, store, apiIdentity } = fakePrisma();
    seedKey(store, { organizationId: 'org-other' });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    await expect(svc.revokeApiKey('org-test', 'key-1')).rejects.toThrow('API key not found');
    expect(apiIdentity.update).not.toHaveBeenCalled();
  });

  it('404s for an unknown key id', async () => {
    const { prisma, apiIdentity } = fakePrisma();
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    await expect(svc.revokeApiKey('org-test', 'key-missing')).rejects.toThrow('API key not found');
    expect(apiIdentity.update).not.toHaveBeenCalled();
  });

  it('revoking an already-revoked key is idempotent and writes nothing', async () => {
    const { prisma, store, apiIdentity } = fakePrisma();
    seedKey(store, { active: false });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);

    const revoked = await svc.revokeApiKey('org-test', 'key-1');

    expect(revoked.active).toBe(false);
    expect(apiIdentity.update).not.toHaveBeenCalled();
  });
});

/**
 * Tenant isolation (CBV fix round Task 1, Nov 8 2026). Live, a brand-new
 * email sign-in with no org saw another org's scans and keys because the
 * service passed the session's undefined org id straight into Prisma, which
 * drops undefined filters and runs the query unscoped. The fake Prisma
 * above mirrors that: an undefined org filter returns EVERY org's rows.
 * These tests seed another org's rows and prove a null-org / fresh-user
 * session sees zero scans and zero keys — and that no unscoped query runs.
 * The seeded "other org" stands in for the real Aptria org; no real Aptria
 * data or key is ever used here. The fresh-user email matches no intake.
 */
const OTHER_ORG = 'org-other';

function seedOtherOrgData(
  store: Map<string, Record<string, unknown>>,
  runs: Array<Record<string, unknown>>,
  entitlements: Array<Record<string, unknown>>,
) {
  store.set('key-other', {
    id: 'key-other',
    organizationId: OTHER_ORG,
    label: 'Other Org Key',
    apiKeyHash: 'other-hash-that-must-never-leave',
    active: true,
    lastUsedAt: new Date('2026-11-08T16:17:34.000Z'),
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    updatedAt: new Date('2026-11-08T00:00:00.000Z'),
  });
  runs.push({
    id: 'run-other-1',
    orgId: OTHER_ORG,
    product: 'invoice-proof',
    sourceType: 'API',
    status: 'FAILED',
    riskLevel: 'HIGH',
    inputSummary: 'other org scan',
    outputSummary: 'other org result',
    confidence: 0.9,
    createdAt: new Date('2026-11-08T16:17:36.000Z'),
    updatedAt: new Date('2026-11-08T16:17:36.000Z'),
  });
  entitlements.push({
    id: 'ent-other-1',
    organizationId: OTHER_ORG,
    product: 'INVOICE_PROOF',
    planSlug: 'proof-pilot',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    updatedAt: new Date('2026-09-28T00:00:00.000Z'),
  });
}

describe('UserDashboardService no-org tenant isolation', () => {
  it('the fake mirrors real Prisma: an undefined org filter returns every orgs rows', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const keys = await (prisma.apiIdentity.findMany as any)({ where: { organizationId: undefined } });
    expect(keys).toHaveLength(1);
    expect(keys[0].id).toBe('key-other');
    const scans = await (prisma.verificationRun.findMany as any)({ where: { orgId: undefined } });
    expect(scans).toHaveLength(1);
    expect(scans[0].id).toBe('run-other-1');
    const billing = await (prisma.proofProductEntitlement.findMany as any)({
      where: { organizationId: undefined },
    });
    expect(billing).toHaveLength(1);
  });

  it('getScans(null) and getScans(undefined) return empty and run no query', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getScans(null)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(svc.getScans(undefined)).resolves.toEqual({ items: [], nextCursor: null });
    expect(prisma.verificationRun.findMany).not.toHaveBeenCalled();
  });

  it('getScans returns only the caller orgs runs', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    runs.push({
      id: 'run-mine-1',
      orgId: 'org-test',
      product: 'invoice-proof',
      sourceType: 'API',
      status: 'PASSED',
      riskLevel: 'LOW',
      inputSummary: 'my scan',
      outputSummary: 'ok',
      confidence: 0.99,
      createdAt: new Date('2026-11-08T10:00:00.000Z'),
      updatedAt: new Date('2026-11-08T10:00:00.000Z'),
    });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const result = await svc.getScans('org-test');
    expect(result.items.map((row: any) => row.id)).toEqual(['run-mine-1']);
    expect(result.nextCursor).toBeNull();
    expect(prisma.verificationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-test' } }),
    );
  });

  it('getApiKeys(null) and getApiKeys(undefined) return empty and run no query', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getApiKeys(null)).resolves.toEqual([]);
    await expect(svc.getApiKeys(undefined)).resolves.toEqual([]);
    expect(prisma.apiIdentity.findMany).not.toHaveBeenCalled();
  });

  it('getApiKeys for a real org never returns another orgs keys', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getApiKeys('org-test')).resolves.toEqual([]);
    expect(prisma.apiIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-test' } }),
    );
  });

  it('getBilling(null) returns empty entitlements and usage and runs no query', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getBilling(null)).resolves.toEqual({ entitlements: [], usageThisMonth: [] });
    await expect(svc.getBilling(undefined)).resolves.toEqual({ entitlements: [], usageThisMonth: [] });
    expect(prisma.proofProductEntitlement.findMany).not.toHaveBeenCalled();
    expect(prisma.verificationRun.groupBy).not.toHaveBeenCalled();
  });

  it('getOverview / getOrganization / getSettings reject for a no-org session before any query', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getOverview(null)).rejects.toThrow('Organization not found');
    await expect(svc.getOrganization(undefined)).rejects.toThrow('Organization not found');
    await expect(svc.getSettings(null)).rejects.toThrow('Organization not found');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.verificationRun.count).not.toHaveBeenCalled();
    expect(prisma.apiIdentity.count).not.toHaveBeenCalled();
  });

  it('createApiKey and revokeApiKey reject for a no-org session and never touch a key', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.createApiKey(null, 'label')).rejects.toThrow('Organization not found');
    await expect(svc.createApiKey(undefined, 'label')).rejects.toThrow('Organization not found');
    await expect(svc.revokeApiKey(null, 'key-other')).rejects.toThrow('Organization not found');
    expect(prisma.apiIdentity.create).not.toHaveBeenCalled();
    expect(prisma.apiIdentity.update).not.toHaveBeenCalled();
  });
});


describe('UserDashboardService.getScan', () => {
  it('returns the caller orgs scan with the list field shape', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    runs.push({
      id: 'run-mine-1',
      orgId: 'org-test',
      product: 'invoice-proof',
      sourceType: 'API',
      status: 'FAILED',
      riskLevel: 'HIGH',
      inputSummary: 'my scan',
      outputSummary: 'my result',
      confidence: 0.9,
      createdAt: new Date('2026-11-08T10:00:00.000Z'),
      updatedAt: new Date('2026-11-08T10:00:00.000Z'),
    });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const result = await svc.getScan('org-test', 'run-mine-1');
    expect((result as any).id).toBe('run-mine-1');
    expect((result as any).product).toBe('invoice-proof');
    expect((result as any).outputSummary).toBe('my result');
    expect(prisma.verificationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-mine-1', orgId: 'org-test' } }),
    );
  });

  it('returns the stored findings on the detail read (scan-detail fix)', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    // Mirrors the live test scan's stored row: outputSummary carries the
    // count ("1 finding(s), 0 critical") while issuesFound carries the
    // finding text itself (proof-core Finding shape, as written by
    // InvoiceProofService.createScanProofRecord).
    const finding = {
      severity: 'medium',
      pattern: 'Missing / ghost PO',
      detail: '1 invoice references no purchase order — unmatched spend that bypasses procurement control.',
      rows: ['INV-0001'],
      evidence: 'Invoices with no PO: INV-0001 ($0.00)',
    };
    runs.push({
      id: 'run-mine-1',
      orgId: 'org-test',
      product: 'invoice-proof',
      sourceType: 'API',
      status: 'FAILED',
      riskLevel: 'MEDIUM',
      inputSummary: 'my scan',
      outputSummary: '1 finding(s), 0 critical',
      confidence: 0.9,
      issuesFound: [finding],
      createdAt: new Date('2026-11-08T10:00:00.000Z'),
      updatedAt: new Date('2026-11-08T10:00:00.000Z'),
    });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const result = await svc.getScan('org-test', 'run-mine-1');
    expect((result as any).issuesFound).toEqual([finding]);
    expect((result as any).outputSummary).toBe('1 finding(s), 0 critical');
    const select = (prisma.verificationRun.findFirst.mock.calls[0][0] as any).select;
    expect(select.issuesFound).toBe(true);
  });

  it('the scans list still omits the finding payload', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    runs.push({
      id: 'run-mine-1',
      orgId: 'org-test',
      product: 'invoice-proof',
      sourceType: 'API',
      status: 'FAILED',
      riskLevel: 'MEDIUM',
      inputSummary: 'my scan',
      outputSummary: '1 finding(s), 0 critical',
      confidence: 0.9,
      issuesFound: [{ severity: 'medium', pattern: 'Missing / ghost PO', detail: 'detail', rows: ['INV-0001'] }],
      createdAt: new Date('2026-11-08T10:00:00.000Z'),
      updatedAt: new Date('2026-11-08T10:00:00.000Z'),
    });
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const result = await svc.getScans('org-test');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('issuesFound');
    const select = (prisma.verificationRun.findMany.mock.calls[0][0] as any).select;
    expect(select.issuesFound).toBeUndefined();
  });

  it('404s for another orgs scan id and for an unknown id', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getScan('org-test', 'run-other-1')).rejects.toThrow('Scan not found');
    await expect(svc.getScan('org-test', 'run-missing')).rejects.toThrow('Scan not found');
  });

  it('rejects for a no-org session before any query', async () => {
    const { prisma, store, runs, entitlements } = fakePrisma();
    seedOtherOrgData(store, runs, entitlements);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getScan(null, 'run-other-1')).rejects.toThrow('Organization not found');
    await expect(svc.getScan(undefined, 'run-other-1')).rejects.toThrow('Organization not found');
    expect(prisma.verificationRun.findFirst).not.toHaveBeenCalled();
  });
});
