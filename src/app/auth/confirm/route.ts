import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { privateResponse } from '@/lib/http';

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (token_hash && (type === 'email' || type === 'signup')) {
    const client = await createClient();
    const { error } = await client.auth.verifyOtp({ token_hash, type });
    if (!error) return privateResponse(NextResponse.redirect(new URL('/', request.url)));
  }
  return privateResponse(NextResponse.redirect(new URL('/login?error=confirmation', request.url)));
}
