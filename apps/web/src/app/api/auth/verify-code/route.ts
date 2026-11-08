import { NextRequest, NextResponse } from 'next/server';

import { resolveConfiguredApiBase } from '@/lib/dashboardUrl';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Verify a one-time sign-in code. On success the API returns a session token
 * exactly once; this route stores it as an httpOnly `cv_session` cookie and
 * strips it from the body — the browser never sees the token.
 */
export async function POST(request: NextRequest) {
  const origin = resolveConfiguredApiBase(API_BASE) || 'http://localhost:3001';
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    const res = await fetch(`${origin}/api/customer-auth/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      return new NextResponse(text, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
      });
    }
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ message: 'Sign-in failed. Please try again.' }, { status: 502 });
    }
    const sessionToken = typeof data.sessionToken === 'string' ? data.sessionToken : '';
    if (!sessionToken) {
      return NextResponse.json({ message: 'Sign-in failed. Please try again.' }, { status: 502 });
    }
    delete data.sessionToken;
    const response = NextResponse.json(data, { status: res.status });
    response.cookies.set('cv_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Sign-in is unavailable right now.' }, { status: 502 });
  }
}
