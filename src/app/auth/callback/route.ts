import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { privateResponse } from '@/lib/http';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return privateResponse(NextResponse.redirect(new URL('/', request.url)));
  }
  return privateResponse(NextResponse.redirect(new URL('/login?error=callback', request.url)));
}
