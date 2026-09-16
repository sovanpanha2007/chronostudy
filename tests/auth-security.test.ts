import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CookieMethodsServer } from '@supabase/ssr';

const mocks = vi.hoisted(() => ({
  serverClient: vi.fn(), exchange: vi.fn(), verify: vi.fn(),
  user: null as { id: string } | null,
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.serverClient }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify },
}) }));

import { proxy } from '../src/proxy';
import { updateSession } from '../src/lib/supabase/proxy';
import { GET as callback } from '../src/app/auth/callback/route';
import { GET as confirm } from '../src/app/auth/confirm/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue({ error: null });
  mocks.serverClient.mockImplementation((_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({
    auth: { getUser: async () => {
      await options.cookies.setAll!([{ name: 'refreshed-session', value: 'test-token', options: { path: '/', secure: true, sameSite: 'lax' } }], {
        'Cache-Control': 'private, no-store', Expires: '0', Pragma: 'no-cache',
      });
      return { data: { user: mocks.user } };
    } },
  }));
});

function request(path: string) { return new NextRequest(`https://chronostudy.example${path}`); }

describe('auth response boundaries', () => {
  it('preserves SDK cache headers and refreshed cookies in the SSR adapter', async () => {
    const req = request('/app');
    const { response } = await updateSession(req);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(req.cookies.get('refreshed-session')?.value).toBe('test-token');
    expect(response.cookies.get('refreshed-session')?.secure).toBe(true);
  });

  it.each([
    ['/app', false, '/login'], ['/onboarding', false, '/login'],
    ['/login', true, '/'], ['/app', true, null],
  ] as const)('keeps auth cookies private on %s (signed in: %s)', async (path, signedIn, destination) => {
    mocks.user = signedIn ? { id: 'user-a' } : null;
    const response = await proxy(request(path));
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.cookies.get('refreshed-session')?.value).toBe('test-token');
    expect(response.headers.get('location')).toBe(destination ? `https://chronostudy.example${destination}` : null);
  });

  it('does not accept an external OAuth redirect target or retain the code in the URL', async () => {
    const response = await callback(request('/auth/callback?code=valid&next=https://attacker.example'));
    expect(mocks.exchange).toHaveBeenCalledWith('valid');
    expect(response.headers.get('location')).toBe('https://chronostudy.example/');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects failed OAuth exchange with a private error redirect', async () => {
    mocks.exchange.mockResolvedValue({ error: new Error('Invalid code') });
    const response = await callback(request('/auth/callback?code=invalid'));
    expect(response.headers.get('location')).toBe('https://chronostudy.example/login?error=callback');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('accepts only supported email confirmation types', async () => {
    const response = await confirm(request('/auth/confirm?token_hash=secret&type=recovery'));
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://chronostudy.example/login?error=confirmation');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('removes the confirmation token from successful redirects', async () => {
    const response = await confirm(request('/auth/confirm?token_hash=secret&type=email'));
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: 'secret', type: 'email' });
    expect(response.headers.get('location')).toBe('https://chronostudy.example/');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
