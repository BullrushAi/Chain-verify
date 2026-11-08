import { NextRequest, NextResponse } from 'next/server';

import { resolveConfiguredApiBase } from '@/lib/dashboardUrl';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who is signed in via the `cv_session` cookie, or 401 when nobody is. */
export async function GET(request: NextRequest) {
  const session = request.cookies.get('cv_session')?.value;
  if (!session) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 });
  const origin = resolveConfiguredApiBase(API_BASE) || 'http://localhost:3001';
  try {
    const res = await fetch(`${origin}/api/customer-auth/me`, {
      headers: { Authorization: 'Bearer ' + session },
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Sign-in is unavailable right now.' }, { status: 502 });
  }
}
