// GET /api/interviews - List all interviews (or filter by studyId)
// Protected: Requires authenticated session

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAllInterviews, getStudyInterviews, isKVAvailable } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';

export async function GET(request: Request) {
  try {
    const { authorized, context, error } = await getRequestContext();
    if (!authorized || !context) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const kvAvailable = await isKVAvailable();
    if (!kvAvailable) {
      return NextResponse.json({
        interviews: [],
        warning: 'Storage not configured. Database unreachable.'
      });
    }

    const { searchParams } = new URL(request.url);
    const studyId = searchParams.get('studyId');

    const interviews = studyId
      ? await getStudyInterviews(studyId)
      : await getAllInterviews();

    return NextResponse.json({ interviews });
  } catch (error) {
    console.error('Interviews API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interviews' },
      { status: 500 }
    );
  }
}
