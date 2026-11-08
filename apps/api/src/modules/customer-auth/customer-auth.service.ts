import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { OUTBOUND_EMAIL, type OutboundEmailPort } from '../adapters/ports.js';
import { sha256Hex } from '../../common/utils/api-key-hash.js';
import type { AuthenticatedUser } from '../auth/types.js';
import {
  CUSTOMER_LOGIN_CODE_EXPIRY_MS,
  CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS,
  CUSTOMER_SESSION_TTL_MS,
  customerLoginCodeHashesMatch,
  generateCustomerLoginCode,
  hashCustomerLoginCode,
  normalizeLoginEmail,
  resolveCustomerLoginCodeSecret,
} from './customer-auth-code.js';

/** The one generic message every failed code comparison returns, so the
 * response never reveals whether the code was wrong, expired, consumed,
 * superseded or locked. */
export const CUSTOMER_LOGIN_INVALID_CODE_MESSAGE =
  'That code is not valid. Request a new code and try again.';

export interface CustomerMe {
  email: string;
  organizationId: string | null;
  organization: { id: string; name: string; slug: string } | null;
  isNewUser: boolean;
}

export interface CustomerSessionResult extends CustomerMe {
  /** Plaintext session token. Returned once, to the web proxy that sets it as
   * an httpOnly cookie. Only its SHA-256 hash is stored. Never log it. */
  sessionToken: string;
  expiresAt: Date;
}

/**
 * Email sign-up / sign-in for dashboard customers (Task 1).
 *
 * No passwords. A 6-digit code is emailed (Brevo/SMTP via OutboundEmailPort,
 * same transport as the vendor-portal OTP), the code verifies exactly once,
 * and a successful verify mints a 30-day session token. The token is accepted
 * by the API-key identity adapter as an org-scoped credential, so the existing
 * JwtAuthGuard and user-dashboard routes work unchanged for email sessions.
 *
 * Stripe-email match: a buyer who paid sees their organization because the
 * login email is matched against the activation intake
 * (ProofPilotIntake.contactEmail) — first directly via its organizationId,
 * then via its Stripe checkout session id through the entitlement. A user
 * whose org is provisioned after sign-up is linked lazily on `getMe`.
 */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOUND_EMAIL) private readonly email: OutboundEmailPort,
  ) {}

  /** Send a one-time sign-in code to `email`. Always the same reply, whether
   * or not the address has an account or a purchase, so the endpoint cannot
   * be used to enumerate customers. */
  async requestCode(emailInput: unknown): Promise<{ message: string }> {
    const email = normalizeLoginEmail(emailInput);
    if (!email) throw new BadRequestException('A valid email address is required');
    // Fail closed before touching the database when the HMAC key is missing.
    const codeSecret = resolveCustomerLoginCodeSecret();

    // Cooldown: failed guesses are counted across EVERY unconsumed code issued
    // to this email inside the expiry window, and a locked code keeps the email
    // locked for the same window. Without this, requesting a fresh code would
    // reset the attempt counter and make the 5-attempt cap meaningless.
    const issuedAt = new Date();
    const windowStart = new Date(issuedAt.getTime() - CUSTOMER_LOGIN_CODE_EXPIRY_MS);
    const recent = await this.prisma.customerLoginCode.findMany({
      where: {
        email,
        consumedAt: null,
        OR: [{ createdAt: { gt: windowStart } }, { lockedAt: { gt: windowStart } }],
      },
      select: { attempts: true, lockedAt: true },
    });
    const recentFailures = recent.reduce((sum, row) => sum + row.attempts, 0);
    if (recent.some((row) => row.lockedAt) || recentFailures >= CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS) {
      throw new ForbiddenException('Sign-in is temporarily unavailable for this email. Please try again later.');
    }

    // Generate a 6-digit code using cryptographic randomness. Only the HMAC
    // of the code is persisted.
    const code = generateCustomerLoginCode();
    const challenge = await this.prisma.customerLoginCode.create({
      data: {
        email,
        codeHash: hashCustomerLoginCode(codeSecret, email, code),
        expiresAt: new Date(issuedAt.getTime() + CUSTOMER_LOGIN_CODE_EXPIRY_MS),
      },
    });

    // Invalidate every earlier unconsumed code for this email. Verification
    // only ever considers the newest active row, so concurrent issues still
    // leave exactly one usable code.
    await this.prisma.customerLoginCode.updateMany({
      where: {
        email,
        id: { not: challenge.id },
        consumedAt: null,
        expiresAt: { gt: issuedAt },
        createdAt: { lte: challenge.createdAt },
      },
      data: { expiresAt: issuedAt },
    });

    // Deliver through the OutboundEmailPort. FAIL CLOSED: if delivery throws,
    // the new code is invalidated so a code nobody received can never be guessed.
    try {
      await this.email.sendCustomerLoginCode({ to: email, code });
    } catch {
      await this.prisma.customerLoginCode.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { expiresAt: new Date() },
      });
      throw new ServiceUnavailableException('We could not send a sign-in code right now. Please try again later.');
    }

    return { message: 'A one-time sign-in code has been sent to your email.' };
  }

  /** Verify a code. On success creates the user on first sign-in (sign-up),
   * links a paid organization by Stripe/activation email, and mints a
   * 30-day session token. */
  async verifyCode(emailInput: unknown, codeInput: unknown): Promise<CustomerSessionResult> {
    const email = normalizeLoginEmail(emailInput);
    if (!email) throw new BadRequestException('A valid email address is required');
    const suppliedCode = typeof codeInput === 'string' ? codeInput.trim() : '';
    if (!suppliedCode) throw new ForbiddenException(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);
    const codeSecret = resolveCustomerLoginCodeSecret();

    // Only the newest active, unlocked, unconsumed, unexpired code can verify.
    const verifyAt = new Date();
    const challenge = await this.prisma.customerLoginCode.findFirst({
      where: { email, consumedAt: null, lockedAt: null, expiresAt: { gt: verifyAt } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw new ForbiddenException(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);

    // Claim one attempt ATOMICALLY: the guard lives in the UPDATE's WHERE
    // clause, so N concurrent guesses can win at most (MAX_ATTEMPTS - attempts)
    // claims and nobody gets to compare once the cap is reached.
    const claim = await this.prisma.customerLoginCode.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        lockedAt: null,
        expiresAt: { gt: verifyAt },
        attempts: { lt: CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count !== 1) throw new ForbiddenException(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);

    const suppliedHash = hashCustomerLoginCode(codeSecret, email, suppliedCode);
    if (!customerLoginCodeHashesMatch(suppliedHash, challenge.codeHash)) {
      // Lock once the counter has reached the cap. Conditional + idempotent.
      await this.prisma.customerLoginCode.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          lockedAt: null,
          attempts: { gte: CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS },
        },
        data: { lockedAt: new Date() },
      });
      throw new ForbiddenException(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);
    }

    // Single use: consume atomically. If two correct submissions race, exactly
    // one UPDATE matches and the other is rejected.
    const consumed = await this.prisma.customerLoginCode.updateMany({
      where: { id: challenge.id, consumedAt: null, lockedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new ForbiddenException(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);

    const organizationId = await this.resolveOrganizationId(email);
    const existing = await this.prisma.customerUser.findUnique({ where: { email } });
    const isNewUser = !existing;
    const user = existing
      ? existing.organizationId
        ? existing
        : organizationId
          ? await this.prisma.customerUser.update({ where: { id: existing.id }, data: { organizationId } })
          : existing
      : await this.prisma.customerUser.create({ data: { email, organizationId: organizationId ?? undefined } });
    const userOrganizationId = user.organizationId ?? null;

    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);
    await this.prisma.customerSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(sessionToken),
        organizationId: userOrganizationId,
        expiresAt,
      },
    });

    const organization = userOrganizationId
      ? await this.prisma.organization.findUnique({ where: { id: userOrganizationId } })
      : null;
    return {
      email,
      organizationId: userOrganizationId,
      organization: organization ? { id: organization.id, name: organization.name, slug: organization.slug } : null,
      isNewUser,
      sessionToken,
      expiresAt,
    };
  }

  /** Who the session belongs to. Lazily links a paid organization that was
   * provisioned after the user first signed up. */
  async getMe(user: AuthenticatedUser): Promise<CustomerMe> {
    if (!user?.id) throw new ForbiddenException('Sign-in required');
    const row = await this.prisma.customerUser.findUnique({ where: { id: user.id } });
    if (!row) throw new ForbiddenException('Sign-in required');
    let organizationId = row.organizationId ?? null;
    if (!organizationId) {
      organizationId = await this.resolveOrganizationId(row.email);
      if (organizationId) {
        await this.prisma.customerUser.update({ where: { id: row.id }, data: { organizationId } });
      }
    }
    const organization = organizationId
      ? await this.prisma.organization.findUnique({ where: { id: organizationId } })
      : null;
    return {
      email: row.email,
      organizationId,
      organization: organization ? { id: organization.id, name: organization.name, slug: organization.slug } : null,
      isNewUser: false,
    };
  }

  /** Sign out everywhere: delete every session for this user. */
  async logout(user: AuthenticatedUser): Promise<{ ok: true }> {
    if (!user?.id) throw new ForbiddenException('Sign-in required');
    await this.prisma.customerSession.deleteMany({ where: { userId: user.id } });
    return { ok: true };
  }

  /**
   * Match a login email to the organization a buyer paid for.
   * Sources, in order: the activation intake's organizationId, then the
   * intake's Stripe checkout session id via the entitlement it provisioned.
   * Returns null when the email has no paid organization yet.
   */
  async resolveOrganizationId(email: string): Promise<string | null> {
    const intakes = await this.prisma.proofPilotIntake.findMany({
      where: { contactEmail: email },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { organizationId: true, stripeSessionId: true },
    });
    for (const intake of intakes) {
      if (intake.organizationId) return intake.organizationId;
      if (intake.stripeSessionId) {
        const entitlement = await this.prisma.proofProductEntitlement.findFirst({
          where: { stripeSessionId: intake.stripeSessionId },
          select: { organizationId: true },
        });
        if (entitlement?.organizationId) return entitlement.organizationId;
      }
    }
    return null;
  }
}
