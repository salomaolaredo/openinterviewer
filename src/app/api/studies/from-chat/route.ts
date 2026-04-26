// POST /api/studies/from-chat
// Persists a study created via the conversational creator.
// Saves the StudyConfig via kv.saveStudy, then writes the v2-only columns
// (original_question, creation_thread) directly via Drizzle.
// Returns the studyId + a signed share link (/p/<jwt>).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import * as jose from 'jose';
import { randomUUID } from 'crypto';

import { db, schema } from '@/lib/db/client';
import { saveStudy, isKVAvailable } from '@/lib/kv';
import { getRequestContext } from '@/lib/researcherContext';
import type {
  StudyConfig,
  StoredStudy,
  ParticipantToken,
} from '@/types';

interface ThreadEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface RequestBody {
  originalQuestion?: unknown;
  creationThread?: unknown;
  finalQuestions?: unknown;
  studyName?: unknown;
  audience?: unknown;
  northStar?: unknown;
}

function isThreadEntry(x: unknown): x is ThreadEntry {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return (
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    typeof m.timestamp === 'number'
  );
}

const DEFAULT_CONSENT_TEXT =
  "Hey — thanks for taking a few minutes. This is a short conversation, not a survey. There are no right or wrong answers. I'm just here to listen. Anything you share will only be used to help the team make better decisions, and you can stop at any time.";

function getTokenSecret(): Uint8Array {
  const secret =
    process.env.PARTICIPANT_TOKEN_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error('Token signing secret not configured');
  }
  return new TextEncoder().encode(secret);
}

async function signParticipantLink(config: StudyConfig): Promise<string> {
  const secret = getTokenSecret();
  const tokenData: ParticipantToken = {
    studyId: config.id,
    studyConfig: config,
    createdAt: Date.now(),
  };
  return new jose.SignJWT(tokenData as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(secret);
}

export async function POST(request: Request) {
  try {
    const { authorized, context, error } = await getRequestContext();
    if (!authorized || !context) {
      return NextResponse.json(
        { error: error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const kvAvailable = await isKVAvailable();
    if (!kvAvailable) {
      return NextResponse.json(
        { error: 'Storage not configured. Database unreachable.' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as RequestBody;

    // ---- Validate input ----
    if (typeof body.originalQuestion !== 'string' || !body.originalQuestion.trim()) {
      return NextResponse.json(
        { error: 'Missing `originalQuestion`' },
        { status: 400 }
      );
    }
    if (typeof body.studyName !== 'string' || !body.studyName.trim()) {
      return NextResponse.json(
        { error: 'Missing `studyName`' },
        { status: 400 }
      );
    }
    if (typeof body.audience !== 'string' || !body.audience.trim()) {
      return NextResponse.json(
        { error: 'Missing `audience`' },
        { status: 400 }
      );
    }
    if (typeof body.northStar !== 'string') {
      return NextResponse.json(
        { error: 'Missing `northStar`' },
        { status: 400 }
      );
    }
    if (
      !Array.isArray(body.finalQuestions) ||
      body.finalQuestions.length === 0 ||
      !body.finalQuestions.every((q) => typeof q === 'string' && q.trim().length > 0)
    ) {
      return NextResponse.json(
        { error: '`finalQuestions` must be a non-empty array of strings' },
        { status: 400 }
      );
    }
    const baseThread: ThreadEntry[] = Array.isArray(body.creationThread)
      ? body.creationThread.filter(isThreadEntry)
      : [];

    // Append a synthetic final-proposal message so the full framing
    // (audience, northStar, final questions) is preserved alongside the chat.
    // Without this, the Synthesizer can't recover the success criteria the
    // researcher signed off on.
    const finalProposalMessage: ThreadEntry = {
      role: 'assistant',
      content: JSON.stringify(
        {
          type: 'final_proposal',
          studyName: body.studyName.trim(),
          audience: body.audience.trim(),
          northStar: body.northStar.trim(),
          questions: (body.finalQuestions as string[]).map((q) => q.trim()),
        },
        null,
        2
      ),
      timestamp: Date.now(),
    };
    const creationThread: ThreadEntry[] = [...baseThread, finalProposalMessage];

    // ---- Build the StudyConfig ----
    const studyId = randomUUID();
    const now = Date.now();

    const config: StudyConfig = {
      id: studyId,
      name: body.studyName.trim(),
      description: body.audience.trim(),
      researchQuestion: body.originalQuestion.trim(),
      coreQuestions: (body.finalQuestions as string[]).map((q) => q.trim()),
      // v2: deprecated fields kept on the type for backwards compat — empty/default.
      topicAreas: [],
      profileSchema: [],
      aiBehavior: 'standard',
      aiProvider: 'claude',
      consentText: DEFAULT_CONSENT_TEXT,
      createdAt: now,
      linksEnabled: true,
    };

    const stored: StoredStudy = {
      id: studyId,
      config,
      createdAt: now,
      updatedAt: now,
      interviewCount: 0,
      isLocked: false,
    };

    // ---- Persist via the existing kv layer (so config + counters land correctly) ----
    const ok = await saveStudy(stored);
    if (!ok) {
      return NextResponse.json(
        { error: 'Failed to save study' },
        { status: 500 }
      );
    }

    // ---- Then write the v2-only columns directly ----
    // (kv.saveStudy doesn't know about original_question / creation_thread.)
    try {
      await db
        .update(schema.studies)
        .set({
          originalQuestion: body.originalQuestion.trim(),
          creationThread,
        })
        .where(eq(schema.studies.id, studyId));
    } catch (err) {
      console.error('Failed to write v2 columns on study creation:', err);
      // Non-fatal: the study itself is saved. Log and continue.
    }

    // ---- Sign the participant link ----
    let token: string;
    try {
      token = await signParticipantLink(config);
    } catch (err) {
      console.error('Failed to sign participant link:', err);
      return NextResponse.json(
        {
          studyId,
          shareLink: null,
          warning:
            'Study saved, but participant link could not be signed. Set PARTICIPANT_TOKEN_SECRET or ADMIN_PASSWORD.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      studyId,
      shareLink: `/p/${token}`,
    });
  } catch (err) {
    console.error('Create study from chat error:', err);
    return NextResponse.json(
      { error: 'Failed to create study from chat' },
      { status: 500 }
    );
  }
}
