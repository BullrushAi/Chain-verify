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
    createApiKey: vi.fn().mockResolvedValue({ id: 'key-1', apiKey: 'cv_live_new', warning: 'w' }),
    revokeApiKey: vi.fn().mockResolvedValue({ id: 'key-1', active: false }),
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
