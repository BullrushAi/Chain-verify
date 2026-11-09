import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

import { UserDashboardController } from './user-dashboard.controller.js';

/**
 * Task 3: creating or retiring a key is an email-session action. A bare API
 * key — even a valid one for the org — must not mint new keys, or a leaked
 * key could mint its own replacements. The controller enforces this before
 * the service is ever called; the service itself stays org-scoped.
 */
function makeController() {
  const svc = {
    getOverview: vi.fn().mockResolvedValue({ organization: { id: 'org-test' } }),
    getScans: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getApiKeys: vi.fn().mockResolvedValue([]),
    createApiKey: vi.fn().mockResolvedValue({ id: 'key-1', apiKey: 'cv_live_new', warning: 'w' }),
    revokeApiKey: vi.fn().mockResolvedValue({ id: 'key-1', active: false }),
    getBilling: vi.fn().mockResolvedValue({ entitlements: [], usageThisMonth: [] }),
    getOrganization: vi.fn().mockResolvedValue({ id: 'org-test' }),
    getSettings: vi.fn().mockResolvedValue({ organization: { id: 'org-test' }, apiKeyCount: 0 }),
  };
  return { ctrl: new UserDashboardController(svc as never), svc };
}

const KEY_ONLY_REQ = { user: { id: 'key-1', organizationId: 'org-test' } };
const EMAIL_REQ = { user: { id: 'user-1', organizationId: 'org-test', email: 'buyer@example.com' } };

describe('UserDashboardController.createApiKey', () => {
  it('rejects a bare API-key identity before calling the service', () => {
    const { ctrl, svc } = makeController();
    // The controller method throws synchronously (it is not async), so assert
    // on the throw itself — .rejects would need a promise that never exists.
    expect(() => ctrl.createApiKey(KEY_ONLY_REQ as never, { label: 'CI' })).toThrow(
      UnauthorizedException,
    );
    expect(svc.createApiKey).not.toHaveBeenCalled();
  });

  it('creates for an email session, scoped to that session\u2019s org', async () => {
    const { ctrl, svc } = makeController();
    const result = await ctrl.createApiKey(EMAIL_REQ as never, { label: 'CI' });
    expect(svc.createApiKey).toHaveBeenCalledWith('org-test', 'CI');
    expect(result).toEqual({ id: 'key-1', apiKey: 'cv_live_new', warning: 'w' });
  });

  it('passes an empty label when none is given', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.createApiKey(EMAIL_REQ as never, {});
    expect(svc.createApiKey).toHaveBeenCalledWith('org-test', '');
  });
});

describe('UserDashboardController.revokeApiKey', () => {
  it('rejects a bare API-key identity before calling the service', () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.revokeApiKey(KEY_ONLY_REQ as never, 'key-1')).toThrow(UnauthorizedException);
    expect(svc.revokeApiKey).not.toHaveBeenCalled();
  });

  it('revokes for an email session, scoped to that session\u2019s org', async () => {
    const { ctrl, svc } = makeController();
    const result = await ctrl.revokeApiKey(EMAIL_REQ as never, 'key-1');
    expect(svc.revokeApiKey).toHaveBeenCalledWith('org-test', 'key-1');
    expect(result).toEqual({ id: 'key-1', active: false });
  });
});

/**
 * Tenant isolation (CBV fix round Task 1, Nov 8 2026). A fresh email sign-up
 * whose email matches no paid org has organizationId null on the session.
 * The controller must pass that null through to the service — never
 * `undefined`, which Prisma would drop from the `where` filter and run
 * unscoped. The service then returns empty / 404s instead of another org's
 * data. The email below is a throwaway matching no intake.
 */
const NO_ORG_EMAIL_REQ = {
  user: { id: 'user-1', organizationId: null, email: 'fresh-throwaway@example.com' },
};
const LEGACY_ORG_ID_REQ = { user: { id: 'key-1', orgId: 'org-test' } };

describe('UserDashboardController no-org tenant isolation', () => {
  it('passes null, never undefined, to the service for every read endpoint', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.getOverview(NO_ORG_EMAIL_REQ as never);
    expect(svc.getOverview).toHaveBeenCalledWith(null);
    await ctrl.getScans(NO_ORG_EMAIL_REQ as never);
    expect(svc.getScans).toHaveBeenCalledWith(null, undefined, undefined);
    await ctrl.getApiKeys(NO_ORG_EMAIL_REQ as never);
    expect(svc.getApiKeys).toHaveBeenCalledWith(null);
    await ctrl.getBilling(NO_ORG_EMAIL_REQ as never);
    expect(svc.getBilling).toHaveBeenCalledWith(null);
    await ctrl.getOrganization(NO_ORG_EMAIL_REQ as never);
    expect(svc.getOrganization).toHaveBeenCalledWith(null);
    await ctrl.getSettings(NO_ORG_EMAIL_REQ as never);
    expect(svc.getSettings).toHaveBeenCalledWith(null);
  });

  it('passes null to the service for key create / revoke from a no-org email session', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.createApiKey(NO_ORG_EMAIL_REQ as never, { label: 'CI' });
    expect(svc.createApiKey).toHaveBeenCalledWith(null, 'CI');
    await ctrl.revokeApiKey(NO_ORG_EMAIL_REQ as never, 'key-1');
    expect(svc.revokeApiKey).toHaveBeenCalledWith(null, 'key-1');
  });

  it('still honours the legacy orgId fallback for API-key identities', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.getScans(LEGACY_ORG_ID_REQ as never);
    expect(svc.getScans).toHaveBeenCalledWith('org-test', undefined, undefined);
  });
});
