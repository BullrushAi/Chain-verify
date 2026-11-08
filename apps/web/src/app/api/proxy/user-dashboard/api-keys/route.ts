import { NextRequest, NextResponse } from 'next/server';

import { dashboardUrl } from '@/lib/dashboardUrl';
import { proxyFetchWithSessionFallback } from '@/lib/proxyAuth';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function passthrough(res: Response) {
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
  });
}

export async function GET(request: NextRequest) {
  try {
    const res = await proxyFetchWithSessionFallback(request, dashboardUrl(API_BASE, 'api-keys'));
    return passthrough(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

// Customer key creation — the same customer endpoint as GET, never the admin
// endpoint (it takes the owner's master key). The body is read once as text
// so the session-fallback retry re-sends the identical body; the first
// attempt 401s before any mutation, so the retry is safe.
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await proxyFetchWithSessionFallback(request, dashboardUrl(API_BASE, 'api-keys'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return passthrough(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id') ?? '';
    const res = await proxyFetchWithSessionFallback(
      request,
      `${dashboardUrl(API_BASE, 'api-keys')}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return passthrough(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
