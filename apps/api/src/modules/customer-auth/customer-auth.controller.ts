import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CustomerAuthService } from './customer-auth.service.js';

/**
 * Customer email sign-up / sign-in (Task 1). No passwords: a 6-digit code is
 * emailed and verified once, and a successful verify mints a 30-day session.
 * request-code and verify-code are the brute-force surface, so each carries a
 * tight per-IP limit (5/min) on top of the global default limiter, mirroring
 * the vendor-portal OTP endpoints.
 */
@Controller('customer-auth')
@UseGuards(JwtAuthGuard)
export class CustomerAuthController {
  constructor(private readonly svc: CustomerAuthService) {}

  @Post('request-code')
  @Public()
  @Throttle({ public: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async requestCode(@Body() body: { email?: unknown }) {
    return this.svc.requestCode(body?.email);
  }

  @Post('verify-code')
  @Public()
  @Throttle({ public: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() body: { email?: unknown; code?: unknown }) {
    return this.svc.verifyCode(body?.email, body?.code);
  }

  @Get('me')
  async getMe(@Req() req: any) {
    return this.svc.getMe(req.user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    return this.svc.logout(req.user);
  }
}
