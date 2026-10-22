import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UserDashboardService } from './user-dashboard.service.js';

@Controller('user-dashboard')
@UseGuards(JwtAuthGuard)
export class UserDashboardController {
  constructor(private readonly svc: UserDashboardService) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    const orgId = req.user?.organizationId || req.user?.orgId;
    return this.svc.getOverview(orgId);
  }

  @Get('scans')
  getScans(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const orgId = req.user?.organizationId || req.user?.orgId;
    return this.svc.getScans(orgId, limit ? Number(limit) : undefined, cursor);
  }

  @Get('api-keys')
  getApiKeys(@Req() req: any) {
    const orgId = req.user?.organizationId || req.user?.orgId;
    return this.svc.getApiKeys(orgId);
  }

  @Get('billing')
  getBilling(@Req() req: any) {
    const orgId = req.user?.organizationId || req.user?.orgId;
    return this.svc.getBilling(orgId);
  }

  @Get('organization')
  getOrganization(@Req() req: any) {
    const orgId = req.user?.organizationId || req.user?.orgId;
    return this.svc.getOrganization(orgId);
  }

  @Get('settings')
  getSettings(@Req() req: any) {
    const orgId = req.user?.organizationId || req.user?.orgId;
    return this.svc.getSettings(orgId);
  }
}

