import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { API_KEY_REVEAL_WARNING, mintOrgApiKey } from '../../common/utils/api-key-mint.js';

const API_IDENTITY_SAFE_SELECT = {
  id: true,
  organizationId: true,
  label: true,
  active: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The scan fields the dashboard list shows. Kept light on purpose: the
 * list never carries the finding payload. No proof payload, no raw input,
 * no key material.
 */
const SCAN_SELECT = {
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
} as const;

/**
 * The detail page extends the list select with the stored findings
 * (VerificationRun.issuesFound — the finding objects the scan wrote, with
 * severity / pattern / detail / rows / evidence). No proof payload, no raw
 * input, no key material: findings are the scan's own human-readable result.
 * The list keeps SCAN_SELECT so list responses stay light.
 */
const SCAN_DETAIL_SELECT = {
  ...SCAN_SELECT,
  issuesFound: true,
} as const;

/** A session's org id, which is missing for a fresh email sign-up whose
 * email matches no paid org (see CustomerAuthService.resolveOrganizationId).
 */
type OrganizationId = string | null | undefined;

/**
 * Tenant-isolation guard (CBV fix round Task 1, Nov 8 2026).
 *
 * Prisma silently drops `undefined` values from `where` filters, so passing
 * a missing org id into findMany / count / groupBy runs the query UNSCOPED
 * and returns every org's rows. That is how a brand-new email sign-in with
 * no org saw the real Aptria org's data live (50 scans, 3 keys): the
 * identity adapter yields `organizationId: undefined` for a no-org session
 * and the controller passed it straight through.
 *
 * Every method below therefore handles a missing org id BEFORE any query
 * runs: list / aggregate endpoints return empty shapes, single-org endpoints
 * and mutations throw NotFound. A no-org session can never observe, count,
 * mint, or revoke another org's data.
 */
function requireOrganizationId(organizationId: OrganizationId): string {
  if (!organizationId) throw new NotFoundException('Organization not found');
  return organizationId;
}

@Injectable()
export class UserDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(organizationId: OrganizationId) {
    const orgId = requireOrganizationId(organizationId);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [org, activeApiKeyCount, verificationRunsThisMonth, scansNeedingReview, recentRuns] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.apiIdentity.count({ where: { organizationId: orgId, active: true } }),
      this.prisma.verificationRun.count({ where: { orgId, createdAt: { gte: periodStart } } }),
      this.prisma.verificationRun.count({ where: { orgId, status: { in: ['FAILED', 'NEEDS_REVIEW'] } } }),
      this.prisma.verificationRun.findMany({
        where: { orgId },
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
      scansNeedingReview,
      recentRuns,
    };
  }

  async getScans(organizationId: OrganizationId, limit = 50, cursor?: string) {
    // No org, no scans: return empty without querying. (Without this guard
    // Prisma would drop the undefined org filter and return every org's runs.)
    if (!organizationId) return { items: [], nextCursor: null };
    const orgId = organizationId;
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.verificationRun.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: SCAN_SELECT,
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  }

  /**
   * One scan for the in-dashboard detail page (CBV fix round Task 3,
   * Nov 8 2026). Scoped to the caller's org in the query itself: another
   * org's scan id is a 404, never a cross-tenant read. A no-org session
   * 404s before any query runs (same contract as getOrganization).
   */
  async getScan(organizationId: OrganizationId, scanId: string) {
    const orgId = requireOrganizationId(organizationId);
    const row = await this.prisma.verificationRun.findFirst({
      where: { id: scanId, orgId },
      select: SCAN_DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Scan not found');
    return row;
  }

  async getApiKeys(organizationId: OrganizationId) {
    // No org, no keys: return empty without querying. (Without this guard
    // Prisma would drop the undefined org filter and return every org's keys.)
    if (!organizationId) return [];
    return this.prisma.apiIdentity.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: API_IDENTITY_SAFE_SELECT,
    });
  }

  /**
   * Mints a customer API key with the same shared logic the admin panel uses
   * (see api-key-mint.ts): same prefix, same hash-only storage, raw key
   * returned exactly once, in this response. The list endpoint never returns
   * key material — see getApiKeys and API_IDENTITY_SAFE_SELECT.
   */
  async createApiKey(organizationId: OrganizationId, label: string) {
    const orgId = requireOrganizationId(organizationId);
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const { identity, apiKey } = await mintOrgApiKey(this.prisma, orgId, label);
    return { ...identity, apiKey, warning: API_KEY_REVEAL_WARNING };
  }

  /**
   * Retires one of the caller's own keys. Scoped to the organization: a key
   * from another org is a 404, never a cross-tenant action. Idempotent —
   * revoking an already-revoked key is a no-op, not an error. The row is
   * never deleted, so past usage stays attributable.
   */
  async revokeApiKey(organizationId: OrganizationId, apiIdentityId: string) {
    const orgId = requireOrganizationId(organizationId);
    const identity = await this.prisma.apiIdentity.findUnique({
      where: { id: apiIdentityId },
      select: API_IDENTITY_SAFE_SELECT,
    });
    if (!identity || identity.organizationId !== orgId) {
      throw new NotFoundException('API key not found');
    }
    if (!identity.active) return identity;
    return this.prisma.apiIdentity.update({
      where: { id: apiIdentityId },
      data: { active: false },
      select: API_IDENTITY_SAFE_SELECT,
    });
  }

  async getBilling(organizationId: OrganizationId) {
    // No org, no billing: return empty without querying. (Without this guard
    // Prisma would drop the undefined org filter and return every org's
    // entitlements and usage.)
    if (!organizationId) return { entitlements: [], usageThisMonth: [] };
    const orgId = organizationId;
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const entitlements = await this.prisma.proofProductEntitlement.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    const usageThisMonth = await this.prisma.verificationRun.groupBy({
      by: ['product'],
      where: { orgId, createdAt: { gte: periodStart } },
      _count: { _all: true },
    });
    return { entitlements, usageThisMonth: usageThisMonth.map((r) => ({ product: r.product, count: r._count._all })) };
  }

  async getOrganization(organizationId: OrganizationId) {
    const orgId = requireOrganizationId(organizationId);
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async getSettings(organizationId: OrganizationId) {
    const orgId = requireOrganizationId(organizationId);
    const [org, apiKeyCount] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.apiIdentity.count({ where: { organizationId: orgId } }),
    ]);
    if (!org) throw new NotFoundException('Organization not found');
    return { organization: org, apiKeyCount };
  }
}
