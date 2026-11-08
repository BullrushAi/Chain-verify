import { NextRequest, NextResponse } from 'next/server';

import { resolveConfiguredApiBase } from '@/lib/dashboardUrl';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sign out everywhere: deletes every session for this user, then clears the cookie. */
export async function POST(request: NextRequest) {
  const session = request.cookies.get('cv_session')?.value;
  const origin = resolveConfiguredApiBase(API_BASE) || 'http://localhost:3001';
  if (session) {
    try {
      await fetch(`${origin}/api/customer-auth/logout`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session },
        cache: 'no-store',
      });
    } catch {
      /* the cookie is cleared regardless */
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set('cv_session', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
