import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../database/prisma.service.js';
import { UserDashboardService } from './user-dashboard.service.js';

const ORG = {
  id: 'org-test',
  name: 'Throwaway Test Org',
  slug: 'throwaway-test-org',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    organization: { findUnique: vi.fn().mockResolvedValue(ORG) },
    apiIdentity: { count: vi.fn().mockResolvedValue(2) },
    verificationRun: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('UserDashboardService.getOverview', () => {
  it('returns a true scans-needing-review count (FAILED + NEEDS_REVIEW only)', async () => {
    const prisma = fakePrisma();
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
    const prisma = fakePrisma();
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    const overview = await svc.getOverview('org-test');
    expect(overview.organization.name).toBe('Throwaway Test Org');
    expect(overview.activeApiKeyCount).toBe(2);
    expect(overview.verificationRunsThisMonth).toBe(3);
    expect(overview.recentRuns).toEqual([]);
  });

  it('throws when the organization does not exist', async () => {
    const prisma = fakePrisma();
    prisma.organization.findUnique.mockResolvedValue(null);
    const svc = new UserDashboardService(prisma as unknown as PrismaService);
    await expect(svc.getOverview('org-missing')).rejects.toThrow('Organization not found');
  });
});
