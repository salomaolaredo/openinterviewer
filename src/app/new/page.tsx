import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/researcherContext';
import QuestionMakerChat from '@/components/QuestionMakerChat';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New Study',
};

export default async function NewStudyPage() {
  const { authorized } = await getRequestContext();
  if (!authorized) {
    redirect('/login?redirect=/new');
  }
  return <QuestionMakerChat />;
}
