/**
 * Client helpers for customer email sign-in (Task 1). All calls go to the
 * website's own /api/auth/* routes, which proxy to the API and own the
 * httpOnly `cv_session` cookie — the browser never sees the session token.
 */

export interface CustomerMe {
  email: string;
  organizationId: string | null;
  organization: { id: string; name: string; slug: string } | null;
  isNewUser: boolean;
}

export class CustomerAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body: any = await res.json();
    const message = body?.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message)) return message.join(' ');
  } catch {
    /* fall through to the status-based message */
  }
  return res.status === 429
    ? 'Too many attempts. Please wait a minute and try again.'
    : 'Something went wrong. Please try again.';
}

async function postJson(path: string, payload: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new CustomerAuthError(await readError(res), res.status);
  return res.json();
}

/** Ask the API to email a one-time sign-in code to `email`. */
export async function requestLoginCode(email: string): Promise<{ message: string }> {
  return postJson('/api/auth/request-code', { email });
}

/** Verify a code. On success the session cookie is set and the caller is signed in. */
export async function verifyLoginCode(email: string, code: string): Promise<CustomerMe> {
  return postJson('/api/auth/verify-code', { email, code });
}

/** Who is signed in via the session cookie, or null when nobody is. */
export async function fetchCustomerMe(): Promise<CustomerMe | null> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new CustomerAuthError(await readError(res), res.status);
  return res.json();
}

/** Sign out everywhere (deletes every session for this user). */
export async function signOutCustomer(): Promise<void> {
  await postJson('/api/auth/logout', {});
}
