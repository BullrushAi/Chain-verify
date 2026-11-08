import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { sha256Hex } from '../../common/utils/api-key-hash.js';
import { PrismaService } from '../database/prisma.service.js';
import { OUTBOUND_EMAIL } from '../adapters/ports.js';
import { CustomerAuthModule } from './customer-auth.module.js';
import { hashCustomerLoginCode } from './customer-auth-code.js';

/**
 * HTTP end-to-end proof for Task 1 (no live database needed: PrismaService
 * and the email port are mocked, the real controller, service, guard and
 * identity adapter run). Proves the exact acceptance flow over HTTP:
 * request-code -> verify-code (session token minted) -> me (session token
 * accepted as an org-scoped credential) -> logout, plus the failure cases.
 */
const SECRET = 'test-secret-123';
const EMAIL = 'buyer@example.com';
const ORG_ID = 'org-paid-1';

process.env.CUSTOMER_LOGIN_CODE_SECRET = SECRET;
process.env.NODE_ENV = 'test';

function makePrisma() {
  return {
    customerLoginCode: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'code-1', ...data, createdAt: new Date() })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customerUser: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'user-1', ...data })),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    customerSession: {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    proofPilotIntake: { findMany: vi.fn().mockResolvedValue([]) },
    proofProductEntitlement: { findFirst: vi.fn().mockResolvedValue(null) },
    organization: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => ({ id: where.id, name: 'Acme Corp', slug: 'acme-corp' })),
    },
    apiIdentity: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
  };
}

describe('CustomerAuthController (HTTP)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;
  let sendCode: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    prisma = makePrisma();
    sendCode = vi.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({ imports: [CustomerAuthModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(OUTBOUND_EMAIL)
      .useValue({ sendCustomerLoginCode: sendCode })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.customerLoginCode.findMany.mockResolvedValue([]);
    prisma.customerLoginCode.findFirst.mockResolvedValue(null);
    prisma.customerLoginCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.customerUser.findUnique.mockResolvedValue(null);
    prisma.proofPilotIntake.findMany.mockResolvedValue([]);
    prisma.proofProductEntitlement.findFirst.mockResolvedValue(null);
    prisma.customerSession.findFirst.mockResolvedValue(null);
    prisma.apiIdentity.findFirst.mockResolvedValue(null);
  });

  async function requestCode(email: string) {
    const res = await request(app.getHttpServer()).post('/api/customer-auth/request-code').send({ email });
    expect(res.status).toBe(200);
    return (sendCode as any).mock.calls.at(-1)[0].code as string;
  }

  it('signup + login over HTTP: code in, session token out, token unlocks /me', async () => {
    const code = await requestCode(EMAIL);
    expect(code).toMatch(/^\d{6}$/);
    // Only the HMAC of the code is stored.
    const stored = (prisma.customerLoginCode.create as any).mock.calls[0][0].data;
    expect(stored.codeHash).toBe(hashCustomerLoginCode(SECRET, EMAIL, code));

    (prisma.customerLoginCode.findFirst as any).mockResolvedValue({
      id: 'code-1',
      email: EMAIL,
      codeHash: hashCustomerLoginCode(SECRET, EMAIL, code),
    });
    const verify = await request(app.getHttpServer())
      .post('/api/customer-auth/verify-code')
      .send({ email: EMAIL, code });
    expect(verify.status).toBe(200);
    expect(verify.body.email).toBe(EMAIL);
    expect(verify.body.isNewUser).toBe(true);
    expect(verify.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    // Only the token hash is stored; the plaintext token is returned once.
    const storedSession = (prisma.customerSession.create as any).mock.calls[0][0].data;
    expect(storedSession.tokenHash).toBe(sha256Hex(verify.body.sessionToken));

    // The minted token is accepted as an org-scoped credential on /me.
    (prisma.customerSession.findFirst as any).mockResolvedValue({
      userId: 'user-1',
      organizationId: null,
      user: { id: 'user-1', email: EMAIL, organizationId: null },
    });
    (prisma.customerUser.findUnique as any).mockResolvedValue({ id: 'user-1', email: EMAIL, organizationId: null });
    const me = await request(app.getHttpServer())
      .get('/api/customer-auth/me')
      .set('Authorization', `Bearer ${verify.body.sessionToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(EMAIL);
    expect(me.body.organizationId).toBeNull();

    const logout = await request(app.getHttpServer())
      .post('/api/customer-auth/logout')
      .set('Authorization', `Bearer ${verify.body.sessionToken}`);
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });
    expect(prisma.customerSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('matches the Stripe/activation email over HTTP: a buyer sees their org', async () => {
    (prisma.proofPilotIntake.findMany as any).mockResolvedValue([
      { organizationId: ORG_ID, stripeSessionId: 'cs_test_123' },
    ]);
    const code = await requestCode(EMAIL);
    (prisma.customerLoginCode.findFirst as any).mockResolvedValue({
      id: 'code-1',
      email: EMAIL,
      codeHash: hashCustomerLoginCode(SECRET, EMAIL, code),
    });
    const verify = await request(app.getHttpServer())
      .post('/api/customer-auth/verify-code')
      .send({ email: EMAIL, code });
    expect(verify.status).toBe(200);
    expect(verify.body.organizationId).toBe(ORG_ID);
    expect(verify.body.organization).toEqual({ id: ORG_ID, name: 'Acme Corp', slug: 'acme-corp' });
  });

  it('rejects a bad email (400), a wrong code (403), and /me without a session (401)', async () => {
    const badEmail = await request(app.getHttpServer())
      .post('/api/customer-auth/request-code')
      .send({ email: 'not-an-email' });
    expect(badEmail.status).toBe(400);

    const code = await requestCode(EMAIL);
    (prisma.customerLoginCode.findFirst as any).mockResolvedValue({
      id: 'code-1',
      email: EMAIL,
      codeHash: hashCustomerLoginCode(SECRET, EMAIL, code),
    });
    const wrong = await request(app.getHttpServer())
      .post('/api/customer-auth/verify-code')
      .send({ email: EMAIL, code: '000000' });
    expect(wrong.status).toBe(403);

    const me = await request(app.getHttpServer()).get('/api/customer-auth/me');
    expect(me.status).toBe(401);
  });
});
