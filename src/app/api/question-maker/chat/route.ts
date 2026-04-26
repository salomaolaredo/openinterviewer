// POST /api/question-maker/chat
// Stateless turn-handler for the conversational study creator.
// Input: full thread + new user message. Output: Claude's reply (and proposal if ready).
// No DB writes here — persistence happens in /api/studies/from-chat.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/researcherContext';
import {
  runQuestionMakerTurn,
  type ChatMessage,
} from '@/lib/prompts/question-maker';

interface RequestBody {
  thread?: unknown;
  message?: unknown;
}

function isChatMessage(x: unknown): x is ChatMessage {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return (
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    typeof m.timestamp === 'number'
  );
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

    if (!context.anthropicApiKey) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY is not configured on the server. The question maker requires Claude.',
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as RequestBody;

    if (typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json(
        { error: 'Missing or empty `message`' },
        { status: 400 }
      );
    }

    const thread: ChatMessage[] = Array.isArray(body.thread)
      ? body.thread.filter(isChatMessage)
      : [];

    const result = await runQuestionMakerTurn(
      thread,
      body.message,
      context.anthropicApiKey
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('Question maker chat error:', err);
    return NextResponse.json(
      { error: 'Question maker turn failed' },
      { status: 500 }
    );
  }
}
