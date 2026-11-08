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
  const apiIdentity = {
    findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
      const row = store.get(where.id);
      return row ? applySelect(row, select) : null;
    }),
    findMany: vi.fn(
      async ({ where, select }: { where: { organizationId: string }; select?: Record<string, boolean> }) => {
        const rows = Array.from(store.values()).filter((row) => row.organizationId === where.organizationId);
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
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { prisma, store, apiIdentity };
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
