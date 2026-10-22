import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

const API_IDENTITY_SAFE_SELECT = {
  id: true,
  organizationId: true,
  label: true,
  active: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(organizationId: string) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [org, activeApiKeyCount, verificationRunsThisMonth, recentRuns] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.apiIdentity.count({ where: { organizationId, active: true } }),
      this.prisma.verificationRun.count({ where: { orgId: organizationId, createdAt: { gte: periodStart } } }),
      this.prisma.verificationRun.findMany({
        where: { orgId: organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, product: true, status: true, riskLevel: true, createdAt: true, updatedAt: true },
      }),
    ]);
    if (!org) throw new NotFoundException('Organization not found');
    return {
      organization: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt },
      activeApiKeyCount,
      verificationRunsThisMonth,
      recentRuns,
    };
  }

  async getScans(organizationId: string, limit = 50, cursor?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.verificationRun.findMany({
      where: { orgId: organizationId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        product: true,
        sourceType: true,
        status: true,
        riskLevel: true,
        inputSummary: true,
        outputSummary: true,
        confidence: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  }

  async getApiKeys(organizationId: string) {
    return this.prisma.apiIdentity.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: API_IDENTITY_SAFE_SELECT,
    });
  }

  async getBilling(organizationId: string) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const entitlements = await this.prisma.proofProductEntitlement.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const usageThisMonth = await this.prisma.verificationRun.groupBy({
      by: ['product'],
      where: { orgId: organizationId, createdAt: { gte: periodStart } },
      _count: { _all: true },
    });
    return { entitlements, usageThisMonth: usageThisMonth.map((r) => ({ product: r.product, count: r._count._all })) };
  }

  async getOrganization(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async getSettings(organizationId: string) {
    const [org, apiKeyCount] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.apiIdentity.count({ where: { organizationId } }),
    ]);
    if (!org) throw new NotFoundException('Organization not found');
    return { organization: org, apiKeyCount };
  }
}

