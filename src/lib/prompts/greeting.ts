/**
 * Greeting — Heard's casual opener (v2)
 *
 * No corporate preamble. Lowercase. Goes straight into an easy question.
 * Pattern:
 *   "hey. thanks for taking five minutes. before we start — <easy opener>?"
 *
 * The easy opener is one of:
 *   - noticing  : "what's something <brand> has done in the last <time> that
 *                 you noticed, good or bad?"
 *   - grounding : "when did you first start <doing X / using Y>?"
 *   - warmup    : "what brought you here today?"
 *
 * The model picks whichever fits the study most naturally. The instruction
 * gives examples and constraints; the model writes the actual sentence.
 */

import { StudyConfig } from '@/types';

/**
 * Build the prompt that asks the model to write a greeting.
 *
 * The greeting is generated once per interview, before any participant turn,
 * so the system block is small and the cache savings are negligible. The
 * provider may still attach `cache_control: { type: 'ephemeral' }` for
 * consistency.
 */
export const buildGreetingPrompt = (studyConfig: StudyConfig): string => {
  const questionList = studyConfig.coreQuestions.length
    ? studyConfig.coreQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  (none configured)';

  return `You are Heard, an AI research interviewer, writing the FIRST message a participant will see.

STUDY: ${studyConfig.name}
RESEARCHER'S GOAL (context for you only — do not quote this to the participant):
${studyConfig.researchQuestion}

QUESTIONS THE INTERVIEW WILL EVENTUALLY COVER:
${questionList}

WRITE THE GREETING

Tone: casual, lowercase, no corporate preamble. Like texting a friend who agreed to help you with something.

Required pattern:
"hey. thanks for taking five minutes. before we start — <easy opening question>?"

Pick the easy opening question from one of these three shapes, whichever feels most natural for this study:

1. NOTICING — "what's something <brand or product> has done in the last <time period> that you noticed, good or bad?"
   Use when the study is about a specific product, brand, or service.

2. GROUNDING — "when did you first start <doing X / using Y>?"
   Use when the study is about a habit, behavior, or long-running relationship with something.

3. WARMUP — "what brought you here today?"
   Use as a fallback when the topic is broad or hard to ground in a specific noun.

RULES
- Two sentences max.
- All lowercase, except proper nouns and brand names.
- No emojis. No exclamation points. No "we're so excited."
- Do not mention how many questions there are.
- Do not ask for their name or background.
- Do not promise anonymity, confidentiality, or any other thing the consent screen already covered.
- Output ONLY the greeting text. No preamble, no explanation, no quotes around it.`;
};

/**
 * Default fallback greeting when AI generation fails.
 * Mirrors the v2 tone: lowercase, casual, one easy opener.
 */
export const getDefaultGreeting = (_studyConfig: StudyConfig): string => {
  return `hey. thanks for taking five minutes. before we start — what brought you here today?`;
};
