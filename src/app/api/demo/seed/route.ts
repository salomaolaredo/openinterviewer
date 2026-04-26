// POST /api/demo/seed - Seed demo data to the database
// DELETE /api/demo/seed - Clear demo data
// Protected: Requires authenticated admin session

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/researcherContext';
import {
  saveStudy,
  saveInterview,
  isKVAvailable,
  getAllStudies,
  deleteInterview,
} from '@/lib/kv';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import {
  DEMO_STUDIES,
  DEMO_INTERVIEWS,
  DEMO_ORIGINAL_QUESTION,
  DEMO_CREATION_THREAD,
} from '@/lib/demoData';

export async function POST() {
  try {
    const { authorized, context, error } = await getRequestContext();
    if (!authorized || !context) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const kvAvailable = await isKVAvailable();
    if (!kvAvailable) {
      return NextResponse.json(
        { error: 'Storage not configured. Database unreachable.' },
        { status: 503 }
      );
    }

    // Check if demo data already exists
    const existingStudies = await getAllStudies();
    const demoExists = existingStudies.some((s) => s.id.startsWith('demo-'));
    if (demoExists) {
      return NextResponse.json(
        { error: 'Demo data already loaded. Clear it first if you want to reload.' },
        { status: 409 }
      );
    }

    // Seed studies
    let studiesSeeded = 0;
    for (const study of DEMO_STUDIES) {
      const success = await saveStudy(study);
      if (success) studiesSeeded++;

      // v2 (Heard): saveStudy doesn't know about original_question /
      // creation_thread. Write those columns directly so the demo study
      // matches what the conversational creator would produce.
      try {
        await db
          .update(schema.studies)
          .set({
            originalQuestion: DEMO_ORIGINAL_QUESTION,
            creationThread: DEMO_CREATION_THREAD,
          })
          .where(eq(schema.studies.id, study.id));
      } catch (err) {
        console.error('Failed to write v2 columns for demo study:', study.id, err);
        // Non-fatal: study is already saved. Log and continue.
      }
    }

    // Seed interviews
    let interviewsSeeded = 0;
    for (const interview of DEMO_INTERVIEWS) {
      const success = await saveInterview(interview);
      if (success) interviewsSeeded++;
    }

    return NextResponse.json({
      success: true,
      message: 'Demo data loaded successfully',
      data: {
        studiesSeeded,
        interviewsSeeded,
        aggregateSynthesisAvailable: true,
      },
    });
  } catch (error) {
    console.error('Demo seed error:', error);
    return NextResponse.json({ error: 'Failed to seed demo data' }, { status: 500 });
  }
}

// DELETE /api/demo/seed - Clear demo data
export async function DELETE() {
  try {
    const { authorized, context, error } = await getRequestContext();
    if (!authorized || !context) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const kvAvailable = await isKVAvailable();
    if (!kvAvailable) {
      return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
    }

    // Delete demo interviews first (turns cascade)
    let interviewsDeleted = 0;
    for (const interview of DEMO_INTERVIEWS) {
      const ok = await deleteInterview(interview.id, interview.studyId);
      if (ok) interviewsDeleted++;
    }

    // Then delete demo studies (cannot use deleteStudy because it refuses when interviewCount > 0 by row count — interviews are already gone)
    let studiesDeleted = 0;
    for (const study of DEMO_STUDIES) {
      try {
        await db.delete(schema.studies).where(eq(schema.studies.id, study.id));
        studiesDeleted++;
      } catch (err) {
        console.warn('Failed to delete demo study:', study.id, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Demo data cleared',
      data: {
        studiesDeleted,
        interviewsDeleted,
      },
    });
  } catch (error) {
    console.error('Demo clear error:', error);
    return NextResponse.json({ error: 'Failed to clear demo data' }, { status: 500 });
  }
}
