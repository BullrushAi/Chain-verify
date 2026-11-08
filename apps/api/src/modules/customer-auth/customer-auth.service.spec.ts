import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../../common/utils/api-key-hash.js';
import { CustomerAuthService, CUSTOMER_LOGIN_INVALID_CODE_MESSAGE } from './customer-auth.service.js';
import { hashCustomerLoginCode } from './customer-auth-code.js';

const SECRET = 'test-secret-123';
const EMAIL = 'buyer@example.com';
const ORG_ID = 'org-paid-1';

process.env.CUSTOMER_LOGIN_CODE_SECRET = SECRET;
process.env.NODE_ENV = 'test';

function makePrisma(overrides: Record<string, any> = {}) {
  const prisma = {
    customerLoginCode: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'code-1',
        ...data,
        createdAt: new Date(),
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customerUser: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'user-1', ...data })),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    customerSession: {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    proofPilotIntake: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    proofProductEntitlement: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    organization: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => ({
        id: where.id,
        name: 'Acme Corp',
        slug: 'acme-corp',
      })),
    },
    ...overrides,
  };
  return prisma as never;
}

function makeService(prisma: any, emailOverrides: Record<string, any> = {}) {
  const sendCode = emailOverrides.sendCustomerLoginCode ?? vi.fn().mockResolvedValue(undefined);
  const email = { sendCustomerLoginCode: sendCode } as never;
  return { service: new CustomerAuthService(prisma as never, email), sendCode };
}

describe('CustomerAuthService.requestCode', () => {
  it('sends a 6-digit code and stores only its HMAC, never the code', async () => {
    const prisma = makePrisma();
    const { service, sendCode } = makeService(prisma);
    const result = await service.requestCode(EMAIL);
    expect(result).toEqual({ message: 'A one-time sign-in code has been sent to your email.' });
    expect(sendCode).toHaveBeenCalledTimes(1);
    const sentCode = (sendCode as any).mock.calls[0][0].code as string;
    expect(sentCode).toMatch(/^\d{6}$/);
    expect((sendCode as any).mock.calls[0][0].to).toBe(EMAIL);
    const stored = (prisma.customerLoginCode.create as any).mock.calls[0][0].data;
    expect(stored.email).toBe(EMAIL);
    expect(stored.codeHash).toBe(hashCustomerLoginCode(SECRET, EMAIL, sentCode));
    expect(JSON.stringify(stored)).not.toContain(sentCode);
  });

  it('rejects an invalid email without sending anything', async () => {
    const prisma = makePrisma();
    const { service, sendCode } = makeService(prisma);
    await expect(service.requestCode('not-an-email')).rejects.toThrow('A valid email address is required');
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('refuses a new code while the email is locked by recent failures', async () => {
    const prisma = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([{ attempts: 5, lockedAt: new Date() }]),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const { service, sendCode } = makeService(prisma);
    await expect(service.requestCode(EMAIL)).rejects.toThrow('temporarily unavailable');
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('invalidates the code and fails closed when email delivery fails', async () => {
    const prisma = makePrisma();
    const failing = vi.fn().mockRejectedValue(new Error('Brevo down'));
    const { service } = makeService(prisma, { sendCustomerLoginCode: failing });
    await expect(service.requestCode(EMAIL)).rejects.toThrow('could not send a sign-in code');
    const invalidate = (prisma.customerLoginCode.updateMany as any).mock.calls.at(-1)[0];
    expect(invalidate.where.id).toBe('code-1');
    expect(invalidate.data.expiresAt).toBeInstanceOf(Date);
  });
});

describe('CustomerAuthService.verifyCode', () => {
  function challengeRow(code: string, overrides: Record<string, any> = {}) {
    return {
      id: 'code-1',
      email: EMAIL,
      codeHash: hashCustomerLoginCode(SECRET, EMAIL, code),
      attempts: 0,
      ...overrides,
    };
  }

  it('signs up a brand-new email: creates the user, mints a session, stores only the token hash', async () => {
    const prisma = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(challengeRow('482917')),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const { service } = makeService(prisma);
    const result = await service.verifyCode(EMAIL, '482917');
    expect(result.email).toBe(EMAIL);
    expect(result.organizationId).toBeNull();
    expect(result.isNewUser).toBe(true);
    expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    // The plaintext token is returned once; only its hash is stored.
    const storedSession = (prisma.customerSession.create as any).mock.calls[0][0].data;
    expect(storedSession.tokenHash).toBe(sha256Hex(result.sessionToken));
    expect(JSON.stringify(storedSession)).not.toContain(result.sessionToken);
    expect(storedSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.customerUser.create).toHaveBeenCalledWith({ data: { email: EMAIL } });
  });

  it('matches the login email to the Stripe/activation email: intake organization wins', async () => {
    const prisma = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(challengeRow('482917')),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      proofPilotIntake: {
        findMany: vi.fn().mockResolvedValue([{ organizationId: ORG_ID, stripeSessionId: 'cs_test_123' }]),
      },
    });
    const { service } = makeService(prisma);
    const result = await service.verifyCode('  Buyer@Example.COM ', '482917');
    expect(result.organizationId).toBe(ORG_ID);
    expect(result.organization).toEqual({ id: ORG_ID, name: 'Acme Corp', slug: 'acme-corp' });
    expect(prisma.customerUser.create).toHaveBeenCalledWith({
      data: { email: EMAIL, organizationId: ORG_ID },
    });
  });

  it('matches via the Stripe checkout session when the intake has no org yet', async () => {
    const prisma = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(challengeRow('482917')),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      proofPilotIntake: {
        findMany: vi.fn().mockResolvedValue([{ organizationId: null, stripeSessionId: 'cs_test_999' }]),
      },
      proofProductEntitlement: {
        findFirst: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
      },
    });
    const { service } = makeService(prisma);
    const result = await service.verifyCode(EMAIL, '482917');
    expect(result.organizationId).toBe(ORG_ID);
    expect(prisma.proofProductEntitlement.findFirst).toHaveBeenCalledWith({
      where: { stripeSessionId: 'cs_test_999' },
      select: { organizationId: true },
    });
  });

  it('rejects a wrong code with the generic message and never reveals which check failed', async () => {
    const prisma = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(challengeRow('482917')),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const { service } = makeService(prisma);
    await expect(service.verifyCode(EMAIL, '000000')).rejects.toThrow(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);
    expect(prisma.customerSession.create).not.toHaveBeenCalled();
    expect(prisma.customerUser.create).not.toHaveBeenCalled();
  });

  it('rejects when no active code exists and when the attempt claim loses the race', async () => {
    const noCode = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(makeService(noCode).service.verifyCode(EMAIL, '482917')).rejects.toThrow(
      CUSTOMER_LOGIN_INVALID_CODE_MESSAGE,
    );

    const raceLost = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(challengeRow('482917')),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await expect(makeService(raceLost).service.verifyCode(EMAIL, '482917')).rejects.toThrow(
      CUSTOMER_LOGIN_INVALID_CODE_MESSAGE,
    );
    expect(raceLost.customerSession.create).not.toHaveBeenCalled();
  });

  it('locks the code once the attempt cap is reached', async () => {
    const prisma = makePrisma({
      customerLoginCode: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(challengeRow('482917', { attempts: 4 })),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const { service } = makeService(prisma);
    await expect(service.verifyCode(EMAIL, '000000')).rejects.toThrow(CUSTOMER_LOGIN_INVALID_CODE_MESSAGE);
    const lockCall = (prisma.customerLoginCode.updateMany as any).mock.calls.find(
      (c: any) => c[0].data.lockedAt,
    );
    expect(lockCall).toBeDefined();
    expect(lockCall[0].where.attempts).toEqual({ gte: 5 });
  });
});

describe('CustomerAuthService.getMe / logout', () => {
  it('lazily links an organization provisioned after sign-up', async () => {
    const prisma = makePrisma({
      customerUser: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', email: EMAIL, organizationId: null }),
        create: vi.fn(),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      proofPilotIntake: {
        findMany: vi.fn().mockResolvedValue([{ organizationId: ORG_ID, stripeSessionId: null }]),
      },
    });
    const { service } = makeService(prisma);
    const me = await service.getMe({ id: 'user-1', email: EMAIL } as never);
    expect(me.organizationId).toBe(ORG_ID);
    expect(me.organization).toEqual({ id: ORG_ID, name: 'Acme Corp', slug: 'acme-corp' });
    expect(prisma.customerUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { organizationId: ORG_ID },
    });
  });

  it('requires a signed-in user for me and logout', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    await expect(service.getMe({} as never)).rejects.toThrow('Sign-in required');
    await expect(service.logout({} as never)).rejects.toThrow('Sign-in required');
  });

  it('logout deletes every session for the user', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    await expect(service.logout({ id: 'user-1' } as never)).resolves.toEqual({ ok: true });
    expect(prisma.customerSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});
