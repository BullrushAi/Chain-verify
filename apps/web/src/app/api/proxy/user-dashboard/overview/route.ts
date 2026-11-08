import { NextRequest, NextResponse } from 'next/server';

import { dashboardUrl } from '@/lib/dashboardUrl';
import { proxyFetchWithSessionFallback } from '@/lib/proxyAuth';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const res = await proxyFetchWithSessionFallback(request, dashboardUrl(API_BASE, 'overview'));
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
