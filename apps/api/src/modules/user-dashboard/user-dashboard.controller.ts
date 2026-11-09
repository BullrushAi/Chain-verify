import { Body, Controller, Delete, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UserDashboardService } from './user-dashboard.service.js';

interface CreateCustomerApiKeyBody {
  label?: string;
}

/**
 * Key creation/retirement is an account action, not a machine action: only an
 * email session may do it. req.user carries `email` only for email-login
 * sessions (see ApiKeyIdentityAdapter); a bare API key — even a valid one for
 * the org — must not mint new keys, or a leaked key could mint replacements.
 */
function requireEmailSession(req: any) {
  if (!req.user?.email) {
    throw new UnauthorizedException('Email sign-in required to manage API keys');
  }
}

/**
 * The session's org, or null when the email sign-in has no org yet (a fresh
 * sign-up whose email matches no paid org). Never `undefined`: Prisma drops
 * undefined `where` filters, which would run the dashboard queries unscoped
 * — that is how a no-org session saw another org's scans and keys (CBV fix
 * round Task 1). The service treats null as "no data at all".
 */
function organizationIdOf(req: any): string | null {
  return req.user?.organizationId || req.user?.orgId || null;
}

@Controller('user-dashboard')
@UseGuards(JwtAuthGuard)
export class UserDashboardController {
  constructor(private readonly svc: UserDashboardService) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    const orgId = organizationIdOf(req);
    return this.svc.getOverview(orgId);
  }

  @Get('scans')
  getScans(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const orgId = organizationIdOf(req);
    return this.svc.getScans(orgId, limit ? Number(limit) : undefined, cursor);
  }

  @Get('api-keys')
  getApiKeys(@Req() req: any) {
    const orgId = organizationIdOf(req);
    return this.svc.getApiKeys(orgId);
  }

  @Post('api-keys')
  createApiKey(@Req() req: any, @Body() body: CreateCustomerApiKeyBody) {
    const orgId = organizationIdOf(req);
    requireEmailSession(req);
    return this.svc.createApiKey(orgId, body?.label ?? '');
  }

  @Delete('api-keys/:apiIdentityId')
  revokeApiKey(@Req() req: any, @Param('apiIdentityId') apiIdentityId: string) {
    const orgId = organizationIdOf(req);
    requireEmailSession(req);
    return this.svc.revokeApiKey(orgId, apiIdentityId);
  }

  @Get('billing')
  getBilling(@Req() req: any) {
    const orgId = organizationIdOf(req);
    return this.svc.getBilling(orgId);
  }

  @Get('organization')
  getOrganization(@Req() req: any) {
    const orgId = organizationIdOf(req);
    return this.svc.getOrganization(orgId);
  }

  @Get('settings')
  getSettings(@Req() req: any) {
    const orgId = organizationIdOf(req);
    return this.svc.getSettings(orgId);
  }
}
