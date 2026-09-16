import { redirect } from 'next/navigation';
import { getAccount } from '@/lib/auth';

export default async function Home() {
  const account = await getAccount();
  redirect(!account ? '/login' : account.profile.onboarded_at ? '/app' : '/onboarding');
}
