import { requireAccount } from '@/lib/auth';
import type { StudySummary } from '@/lib/types';
import { StudyApp } from '@/components/study/StudyApp';

export default async function AppPage() {
  const { client, profile } = await requireAccount();
  const { data, error } = await client.rpc('get_study_summary');
  if (error) throw new Error('Your study record could not be loaded. Please try again.');
  return <StudyApp key={profile.id} profile={profile} initialSummary={data as StudySummary} />;
}
