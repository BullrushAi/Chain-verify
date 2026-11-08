import { NextRequest, NextResponse } from 'next/server';

import { resolveConfiguredApiBase } from '@/lib/dashboardUrl';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Request a one-time email sign-in code. Proxies to the API; no session is created here. */
export async function POST(request: NextRequest) {
  const origin = resolveConfiguredApiBase(API_BASE) || 'http://localhost:3001';
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    const res = await fetch(`${origin}/api/customer-auth/request-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
