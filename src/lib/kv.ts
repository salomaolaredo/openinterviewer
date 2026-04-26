// Postgres storage layer (Drizzle ORM).
// This file preserves the ORIGINAL kv.ts function signatures so existing API
// routes continue to work unchanged. Under the hood, everything is now
// backed by the three-table Postgres schema defined in ./db/schema.ts.
//
// Name kept as `kv.ts` intentionally — all callers still import from @/lib/kv.

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from './db/client';
import type { StoredInterview, StoredStudy, InterviewMessage } from '@/types';

// ============================================
// Row <-> StoredInterview reassembly helpers
// ============================================

function reassembleInterview(
  row: typeof schema.interviews.$inferSelect,
  turnRows: (typeof schema.turns.$inferSelect)[]
): StoredInterview {
  const transcript: InterviewMessage[] = turnRows
    .sort((a, b) => a.turnNumber - b.turnNumber)
    .map((t) => ({
      id: t.messageId ?? String(t.id),
      role: t.role as InterviewMessage['role'],
      content: t.content,
      timestamp: t.messageTimestamp ? t.messageTimestamp.getTime() : 0,
    }));

  return {
    id: row.id,
    studyId: row.studyId,
    studyName: row.studyName,
    participantProfile: row.participantProfile,
    transcript,
    synthesis: row.synthesis ?? null,
    behaviorData:
      row.behaviorData ?? {
        timePerTopic: {},
        messagesPerTopic: {},
        topicsExplored: [],
        contradictions: [],
      },
    createdAt: row.createdAt.getTime(),
    completedAt: row.completedAt ? row.completedAt.getTime() : 0,
    status: (row.status as StoredInterview['status']) ?? 'in_progress',
  };
}

// ============================================
// Interview CRUD
// ============================================

export async function getInterview(id: string): Promise<StoredInterview | null> {
  try {
    const row = await db.query.interviews.findFirst({
      where: eq(schema.interviews.id, id),
    });
    if (!row) return null;

    const turnRows = await db
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.interviewId, id))
      .orderBy(asc(schema.turns.turnNumber));

    return reassembleInterview(row, turnRows);
  } catch (error) {
    console.error('Error getting interview:', error);
    return null;
  }
}

export async function saveInterview(interview: StoredInterview): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      const createdAtDate = new Date(interview.createdAt);
      const completedAtDate =
        interview.completedAt && interview.completedAt > 0
          ? new Date(interview.completedAt)
          : null;

      // UPSERT the interview row
      await tx
        .insert(schema.interviews)
        .values({
          id: interview.id,
          studyId: interview.studyId,
          studyName: interview.studyName,
          participantProfile: interview.participantProfile,
          synthesis: interview.synthesis ?? null,
          behaviorData: interview.behaviorData ?? null,
          status: interview.status,
          createdAt: createdAtDate,
          completedAt: completedAtDate,
        })
        .onConflictDoUpdate({
          target: schema.interviews.id,
          set: {
            studyId: interview.studyId,
            studyName: interview.studyName,
            participantProfile: interview.participantProfile,
            synthesis: interview.synthesis ?? null,
            behaviorData: interview.behaviorData ?? null,
            status: interview.status,
            completedAt: completedAtDate,
          },
        });

      // Idempotent re-save: blow away existing turns, rewrite
      await tx.delete(schema.turns).where(eq(schema.turns.interviewId, interview.id));

      if (interview.transcript && interview.transcript.length > 0) {
        const turnValues = interview.transcript.map((msg, index) => ({
          interviewId: interview.id,
          turnNumber: index,
          role: msg.role,
          content: msg.content,
          messageId: msg.id ?? null,
          messageTimestamp: msg.timestamp ? new Date(msg.timestamp) : null,
        }));
        await tx.insert(schema.turns).values(turnValues);
      }
    });

    return true;
  } catch (error) {
    console.error('Error saving interview:', error);
    return false;
  }
}

export async function getAllInterviews(): Promise<StoredInterview[]> {
  try {
    const interviewRows = await db
      .select()
      .from(schema.interviews)
      .orderBy(desc(schema.interviews.createdAt));

    if (interviewRows.length === 0) return [];

    const ids = interviewRows.map((r) => r.id);
    const turnRows = await db
      .select()
      .from(schema.turns)
      .where(inArray(schema.turns.interviewId, ids))
      .orderBy(asc(schema.turns.interviewId), asc(schema.turns.turnNumber));

    const turnsByInterview = new Map<string, typeof turnRows>();
    for (const t of turnRows) {
      const arr = turnsByInterview.get(t.interviewId) ?? [];
      arr.push(t);
      turnsByInterview.set(t.interviewId, arr);
    }

    return interviewRows.map((row) =>
      reassembleInterview(row, turnsByInterview.get(row.id) ?? [])
    );
  } catch (error) {
    console.error('Error getting all interviews:', error);
    return [];
  }
}

export async function getStudyInterviews(studyId: string): Promise<StoredInterview[]> {
  try {
    const interviewRows = await db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.studyId, studyId))
      .orderBy(desc(schema.interviews.createdAt));

    if (interviewRows.length === 0) return [];

    const ids = interviewRows.map((r) => r.id);
    const turnRows = await db
      .select()
      .from(schema.turns)
      .where(inArray(schema.turns.interviewId, ids))
      .orderBy(asc(schema.turns.interviewId), asc(schema.turns.turnNumber));

    const turnsByInterview = new Map<string, typeof turnRows>();
    for (const t of turnRows) {
      const arr = turnsByInterview.get(t.interviewId) ?? [];
      arr.push(t);
      turnsByInterview.set(t.interviewId, arr);
    }

    return interviewRows.map((row) =>
      reassembleInterview(row, turnsByInterview.get(row.id) ?? [])
    );
  } catch (error) {
    console.error('Error getting study interviews:', error);
    return [];
  }
}

export async function deleteInterview(id: string, _studyId: string): Promise<boolean> {
  try {
    // Turns cascade automatically via ON DELETE CASCADE
    await db.delete(schema.interviews).where(eq(schema.interviews.id, id));
    return true;
  } catch (error) {
    console.error('Error deleting interview:', error);
    return false;
  }
}

export async function isKVAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Study CRUD
// ============================================

function reassembleStudy(row: typeof schema.studies.$inferSelect): StoredStudy {
  return {
    id: row.id,
    config: row.config,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    interviewCount: row.interviewCount,
    isLocked: row.isLocked,
    // v2 (Heard): surface the new metadata columns so the Synthesizer,
    // signals loop, and the researcher dashboard can read them back.
    originalQuestion: row.originalQuestion ?? null,
    creationThread: row.creationThread ?? null,
    aggregateSynthesis: row.aggregateSynthesis ?? null,
  };
}

export async function saveStudy(study: StoredStudy): Promise<boolean> {
  try {
    const createdAt = new Date(study.createdAt);
    const updatedAt = new Date(study.updatedAt);

    await db
      .insert(schema.studies)
      .values({
        id: study.id,
        config: study.config,
        isLocked: study.isLocked,
        interviewCount: study.interviewCount,
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.studies.id,
        set: {
          config: study.config,
          isLocked: study.isLocked,
          interviewCount: study.interviewCount,
          updatedAt,
        },
      });
    return true;
  } catch (error) {
    console.error('Error saving study:', error);
    return false;
  }
}

export async function getStudy(id: string): Promise<StoredStudy | null> {
  try {
    const row = await db.query.studies.findFirst({
      where: eq(schema.studies.id, id),
    });
    return row ? reassembleStudy(row) : null;
  } catch (error) {
    console.error('Error getting study:', error);
    return null;
  }
}

export async function getAllStudies(): Promise<StoredStudy[]> {
  try {
    const rows = await db
      .select()
      .from(schema.studies)
      .orderBy(desc(schema.studies.createdAt));
    return rows.map(reassembleStudy);
  } catch (error) {
    console.error('Error getting all studies:', error);
    return [];
  }
}

export async function deleteStudy(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Mirror existing behavior: refuse if interviews exist.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.interviews)
      .where(eq(schema.interviews.studyId, id));

    if (count > 0) {
      return { success: false, error: 'Cannot delete study with existing interviews' };
    }

    await db.delete(schema.studies).where(eq(schema.studies.id, id));
    return { success: true };
  } catch (error) {
    console.error('Error deleting study:', error);
    return { success: false, error: 'Failed to delete study' };
  }
}

export async function incrementStudyInterviewCount(studyId: string): Promise<boolean> {
  try {
    await db
      .update(schema.studies)
      .set({
        interviewCount: sql`${schema.studies.interviewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.studies.id, studyId));
    return true;
  } catch (error) {
    console.error('Error incrementing study interview count:', error);
    return false;
  }
}

export async function lockStudy(studyId: string): Promise<boolean> {
  try {
    await db
      .update(schema.studies)
      .set({
        isLocked: true,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.studies.id, studyId), eq(schema.studies.isLocked, false)));
    return true;
  } catch (error) {
    console.error('Error locking study:', error);
    return false;
  }
}
