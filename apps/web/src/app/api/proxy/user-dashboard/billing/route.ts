import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const apiKeyHeader = request.headers.get('x-chain-verify-api-key') || request.headers.get('authorization') || '';
  const apiKey = apiKeyHeader.replace('Bearer ', '');
  try {
    const res = await fetch(API_BASE + '/user-dashboard/billing', {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
