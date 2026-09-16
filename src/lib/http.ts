import type { NextResponse } from 'next/server';

// Auth redirects and refreshed cookies must never enter a shared cache.
export function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
