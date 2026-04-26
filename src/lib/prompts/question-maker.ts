/**
 * Question Maker prompt — Heard v2
 *
 * Goal: turn a vague research goal into 5-7 sharp interview questions.
 *
 * Behavior:
 * - Probes for what researchers forget: audience, intent (insight vs. validate),
 *   success criteria.
 * - Asks at most 2-3 clarifying questions before proposing.
 * - Skips probing entirely if the input is already detailed.
 * - When ready, calls the `propose_study` tool to return a structured proposal.
 *
 * The chat history (this thread) is later persisted as `studies.creation_thread`
 * so the Listener and Synthesizer can reference the original framing.
 */

import Anthropic from '@anthropic-ai/sdk';

// Model: Haiku 4.5 — fast + cheap, plenty smart for triage-style probing.
const QUESTION_MAKER_MODEL = 'claude-haiku-4-5';

// ============================================
// Types
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ProposalShape {
  questions: string[];
  audience: string;
  northStar: string;
  studyName: string;
}

export interface QuestionMakerTurnResult {
  reply: string;
  proposal?: ProposalShape;
}

// ============================================
// System prompt
// ============================================

export const QUESTION_MAKER_SYSTEM_PROMPT = `You are Heard — the question-maker. You help a researcher turn a vague research goal into 5-7 sharp interview questions ready to send to participants.

your tone: lowercase, casual, warm but direct. like a smart friend on slack. no preamble, no "great question!", no exclamation marks. short sentences. you can use contractions.

your job has two modes:

MODE A — probe. ask AT MOST 2-3 short clarifying questions if (and only if) the researcher's input is missing one of:
  - audience: who exactly are they planning to interview? (e.g. "free-tier users who churned in the last 30 days", not "users")
  - intent: are they trying to discover something open-ended (insight) or test a specific hypothesis (validate)?
  - success criteria: what answer would actually change their mind or their next move? (the "north star")

ask ONE question at a time. never bundle. never re-ask something they've already answered.

MODE B — propose. as soon as you have enough to draft a good study, stop probing and call the propose_study tool. you don't need every detail; you need enough to write 5-7 questions that won't waste a participant's time.

when you propose, do NOT also write a chat message rehashing the proposal. the panel shows the structured draft separately. just call the tool.

HARD RULES:
- never ask about format, length, methodology, voice vs text, or how the interview will be run. heard handles all of that.
- never ask more than 3 clarifying questions total before proposing.
- if the researcher's first message is already specific (audience + intent + success criteria are inferable), skip probing and propose immediately.
- mirror the researcher's language. if they say "users," don't switch to "customers."
- if the researcher pushes back on a draft, revise via the tool again — don't argue.

WHAT GOOD QUESTIONS LOOK LIKE:
- open-ended, single-barreled, behaviorally anchored
- start with "tell me about a time," "walk me through," "what was going through your mind when"
- avoid leading words ("good," "easy," "frustrating") unless the researcher specifically wants to probe that frame
- mix: 1-2 warm-up/context questions, 3-4 core, 1-2 closing/projection

WHAT GOOD AUDIENCE DESCRIPTIONS LOOK LIKE:
- one sentence, specific enough that the researcher could pick someone out of a CRM list
- bad: "our users"
- good: "founders of pre-seed b2b SaaS startups in brazil who've raised in the last 18 months"

WHAT A GOOD NORTH STAR LOOKS LIKE:
- one sentence describing the answer that would actually change the researcher's next move
- bad: "understand user pain points"
- good: "if 6 out of 10 say onboarding feels confusing in the first 5 minutes, we re-prioritize the welcome flow next sprint"

WHAT A GOOD STUDY NAME LOOKS LIKE:
- 3-6 words, lowercase, descriptive not clever
- e.g. "pricing pushback among free users", "onboarding friction first week"`;

// ============================================
// Tool schema
// ============================================

export const PROPOSE_STUDY_TOOL: Anthropic.Tool = {
  name: 'propose_study',
  description:
    'Return a structured study proposal once you have enough context. Do not call this until you understand the audience, intent, and success criteria — but do not over-probe (max 2-3 clarifying questions).',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
        maxItems: 7,
        description:
          '5-7 interview questions. Open-ended, single-barreled, mirroring the researcher\'s language. Mix 1-2 warm-ups, 3-4 core, 1-2 closing.',
      },
      audience: {
        type: 'string',
        description:
          'One sentence describing the target participant. Specific enough to pick from a CRM list.',
      },
      northStar: {
        type: 'string',
        description:
          'One sentence: what answer would change the researcher\'s mind or next move?',
      },
      studyName: {
        type: 'string',
        description: '3-6 words, lowercase, descriptive. Suggested name for the study.',
      },
    },
    required: ['questions', 'audience', 'northStar', 'studyName'],
  },
};

// ============================================
// Run a single turn
// ============================================

/**
 * Append `newMessage` (from the researcher) to `thread`, send to Claude,
 * and return Claude's reply (text and/or a structured proposal).
 *
 * This function is stateless: callers manage the thread.
 */
export async function runQuestionMakerTurn(
  thread: ChatMessage[],
  newMessage: string,
  apiKey?: string | null
): Promise<QuestionMakerTurnResult> {
  const key = apiKey !== undefined ? apiKey || undefined : process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required for the question maker');
  }

  const client = new Anthropic({ apiKey: key });

  // Build message history. Append the new user message at the end.
  const history: Anthropic.MessageParam[] = thread.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  history.push({ role: 'user', content: newMessage });

  const response = await client.messages.create({
    model: QUESTION_MAKER_MODEL,
    max_tokens: 1024,
    // cache_control on the system prompt — this is large + reused across turns,
    // so we pay once per 5-min window then hit the cache for ~90% off.
    system: [
      {
        type: 'text',
        text: QUESTION_MAKER_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [PROPOSE_STUDY_TOOL],
    // Let Claude decide when to use the tool vs. keep probing.
    tool_choice: { type: 'auto' },
    messages: history,
  });

  // Walk the content blocks. Claude can emit a text reply and/or a tool_use.
  let replyText = '';
  let proposal: ProposalShape | undefined;

  for (const block of response.content) {
    if (block.type === 'text') {
      replyText += block.text;
    } else if (block.type === 'tool_use' && block.name === 'propose_study') {
      const input = block.input as Partial<ProposalShape> | undefined;
      if (
        input &&
        Array.isArray(input.questions) &&
        typeof input.audience === 'string' &&
        typeof input.northStar === 'string' &&
        typeof input.studyName === 'string'
      ) {
        proposal = {
          questions: input.questions.filter((q): q is string => typeof q === 'string'),
          audience: input.audience,
          northStar: input.northStar,
          studyName: input.studyName,
        };
      }
    }
  }

  // If the tool fired but Claude said nothing in text, give a short stand-in
  // so the chat UI doesn't render an empty assistant bubble.
  if (proposal && !replyText.trim()) {
    replyText = "ok — drafted a study on the right. edit anything that's off, then save.";
  }

  // Last-resort fallback if neither text nor tool came back.
  if (!replyText.trim() && !proposal) {
    replyText = 'tell me a bit more — who are you trying to talk to?';
  }

  return { reply: replyText.trim(), proposal };
}
