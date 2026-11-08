import { describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../../common/utils/api-key-hash.js';
import { ApiKeyIdentityAdapter } from '../adapters/adapters.module.js';

/**
 * The email-login session token is accepted by the same identity adapter
 * that checks API keys, so the existing JwtAuthGuard and user-dashboard
 * routes work unchanged for email sessions. The token is never accepted
 * unless its SHA-256 hash matches a live, unexpired session row.
 */
function makeAdapter(prisma: any) {
  return new ApiKeyIdentityAdapter(prisma as never);
}

describe('ApiKeyIdentityAdapter with email-login sessions', () => {
  it('resolves a live session token to the user, email and organization', async () => {
    const token = 'a'.repeat(64);
    const prisma = {
      apiIdentity: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      customerSession: {
        findFirst: vi.fn().mockResolvedValue({
          userId: 'user-1',
          organizationId: 'org-1',
          user: { id: 'user-1', email: 'buyer@example.com', organizationId: 'org-1' },
        }),
      },
    };
    const user = await makeAdapter(prisma).currentUser({ headers: { authorization: `Bearer ${token}` } });
    expect(user).toEqual({ id: 'user-1', organizationId: 'org-1', email: 'buyer@example.com' });
    expect(prisma.customerSession.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: sha256Hex(token), expiresAt: { gt: expect.any(Date) } },
      include: { user: true },
    });
  });

  it('falls back to the user organization when the session carries none', async () => {
    const prisma = {
      apiIdentity: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      customerSession: {
        findFirst: vi.fn().mockResolvedValue({
          userId: 'user-1',
          organizationId: null,
          user: { id: 'user-1', email: 'buyer@example.com', organizationId: 'org-9' },
        }),
      },
    };
    const user = await makeAdapter(prisma).currentUser({ headers: { authorization: 'Bearer tok' } });
    expect(user).toEqual({ id: 'user-1', organizationId: 'org-9', email: 'buyer@example.com' });
  });

  it('rejects an expired or unknown session token', async () => {
    const prisma = {
      apiIdentity: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      customerSession: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      makeAdapter(prisma).currentUser({ headers: { authorization: 'Bearer tok' } }),
    ).resolves.toBeNull();
  });

  it('still resolves API keys exactly as before', async () => {
    const prisma = {
      apiIdentity: {
        findFirst: vi.fn().mockResolvedValue({ id: 'key-1', organizationId: 'org-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      customerSession: { findFirst: vi.fn() },
    };
    const user = await makeAdapter(prisma).currentUser({ headers: { authorization: 'Bearer ag_live_x' } });
    expect(user).toEqual({ id: 'key-1', organizationId: 'org-1' });
    expect(prisma.customerSession.findFirst).not.toHaveBeenCalled();
  });

  it('returns null with no credential at all', async () => {
    const prisma = {
      apiIdentity: { findFirst: vi.fn(), update: vi.fn() },
      customerSession: { findFirst: vi.fn() },
    };
    await expect(makeAdapter(prisma).currentUser({ headers: {} })).resolves.toBeNull();
  });
});
