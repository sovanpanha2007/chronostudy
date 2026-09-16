import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';

export const getAccount = cache(async () => {
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('id, display_name, daily_goal_minutes, timezone, onboarded_at').eq('id', user.id).single();
  if (error) throw new Error('Your profile could not be loaded. Please try again.');
  return { client, user, profile: data as Profile };
});

export async function requireAccount(onboarded = true) {
  const account = await getAccount();
  if (!account) redirect('/login');
  if (onboarded && !account.profile.onboarded_at) redirect('/onboarding');
  return account;
}
