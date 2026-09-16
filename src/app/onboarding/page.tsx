import { redirect } from 'next/navigation';
import { requireAccount } from '@/lib/auth';
import { Onboarding } from '@/components/auth/Onboarding';

export default async function OnboardingPage() {
  const { profile } = await requireAccount(false);
  if (profile.onboarded_at) redirect('/app');
  return <Onboarding />;
}
