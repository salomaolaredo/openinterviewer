/**
 * The Synthesizer — Heard's analysis prompts (v2)
 *
 * Two prompts live here:
 *   1. buildSynthesisPrompt — per-interview synthesis. Keeps the v1 output
 *      shape (themes/contradictions/keyInsights/bottomLine/...) so existing
 *      UI keeps rendering. Adds two v2 fields: surprisingMoments and
 *      originalQuestion.
 *   2. buildAggregateSynthesisPrompt — cross-interview synthesis. Echoes the
 *      researcher's original question verbatim and answers it directly. The
 *      v1 fields (commonThemes, divergentViews, keyFindings, ...) stay
 *      populated so dashboards and follow-up generation keep working.
 *
 * Both prompts are designed to be cache-friendly: the system framing is the
 * stable part, the transcript is the variable tail. Providers should attach
 * `cache_control: { type: 'ephemeral' }` to the system block.
 *
 * Provider note: synthesis is best run on Claude Sonnet 4.6 (or Opus) for
 * reasoning quality. The provider layer already auto-upgrades to
 * CLAUDE_SYNTHESIS_MODEL — no change needed here.
 */

import {
  StudyConfig,
  ParticipantProfile,
  InterviewMessage,
  BehaviorData,
  SynthesisResult,
} from '@/types';

// ============================================================================
// Per-interview synthesis
// ============================================================================

/**
 * Build the per-interview synthesis prompt.
 *
 * Output shape: SynthesisResult (see src/types.ts).
 * The bottomLine should reference the original research question — what did
 * THIS interview contribute toward answering it?
 */
export const buildSynthesisPrompt = (
  history: InterviewMessage[],
  studyConfig: StudyConfig,
  _behaviorData: BehaviorData,
  _participantProfile: ParticipantProfile | null
): string => {
  const interviewText = history
    .map(m => `${m.role === 'user' ? 'PARTICIPANT' : 'INTERVIEWER'}: ${m.content}`)
    .join('\n\n');

  const questionList = studyConfig.coreQuestions.length
    ? studyConfig.coreQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  (none configured)';

  return `You are the Synthesizer for Heard, an AI research tool. You are analyzing ONE interview.

THE RESEARCHER'S ORIGINAL QUESTION (this is what they want answered across all interviews):
${studyConfig.researchQuestion}

QUESTIONS THIS INTERVIEW TRIED TO COVER:
${questionList}

INTERVIEW TRANSCRIPT:
${interviewText}

YOUR JOB

Analyze this single interview and produce a structured synthesis. The structure is constrained (see fields below) — your job is to fill it accurately, with verbatim evidence, in the participant's own words wherever possible.

WHAT TO LOOK FOR

1. statedPreferences — What did the participant explicitly say they value, want, or care about? Quote them or paraphrase tightly.
2. revealedPreferences — What did their emphasis, repetition, or emotional weight reveal that they did NOT say outright?
3. themes — Recurring threads in this single interview, with evidence (a short verbatim quote works best) and how many times the theme surfaced.
4. contradictions — Places where what they said conflicts with what they implied or with something else they said.
5. keyInsights — The two or three most useful things this interview taught the researcher.
6. bottomLine — One sentence that says what THIS interview contributes toward answering the researcher's original question. Frame it as a contribution to the larger answer, not a summary of the chat.
7. surprisingMoments — Topics or concerns the participant raised that the questions did NOT ask about. The "you should have asked" surfacing. Empty array is valid if nothing surprising came up.
8. originalQuestion — Echo the researcher's original question verbatim into this field for downstream display.

RULES

- Quote the participant verbatim whenever possible. Do not paraphrase into corporate language.
- Do not invent evidence. If a theme doesn't have a clean quote, name it briefly without fabricating one.
- Be honest about thin interviews. If the participant gave one-word answers throughout, the synthesis should reflect that, not pad with imagined depth.
- No therapist-speak, no "the participant seems to be navigating their journey of...". Plain language only.`;
};

/**
 * Output schema description (informational — providers define their own
 * tool/JSON schemas). Kept as a string for parity with v1.
 */
export const synthesisOutputDescription = `
Expected output structure (matches SynthesisResult in src/types.ts):
{
  "statedPreferences": ["What participant said they value/want"],
  "revealedPreferences": ["What their emphasis/behavior revealed"],
  "themes": [
    { "theme": "Theme name", "evidence": "Short verbatim quote", "frequency": 3 }
  ],
  "contradictions": ["Gaps between stated and revealed, or internal contradictions"],
  "keyInsights": ["2-3 most useful things this interview taught the researcher"],
  "bottomLine": "One sentence on what THIS interview contributes toward the researcher's original question",
  "surprisingMoments": ["Topics the participant raised that the questions didn't ask about"],
  "originalQuestion": "<verbatim echo of the researcher's original question>"
}
`;

// ============================================================================
// Aggregate synthesis (the killer feature)
// ============================================================================

/**
 * Build the aggregate synthesis prompt.
 *
 * The defining feature: the report opens with the researcher's original
 * question, echoed verbatim, then directly answers it.
 *
 * @param studyConfig — must contain researchQuestion and coreQuestions.
 * @param syntheses — per-interview SynthesisResult objects (already analyzed).
 * @param interviewCount — total interview count for framing.
 * @param interviewTranscripts — optional. If provided, the prompt embeds
 *   transcript snippets so the model can pull verbatim quotes with
 *   interviewId attribution. If omitted, the model relies on the per-
 *   interview themes/evidence already in `syntheses` (degraded mode — the
 *   provider should pass transcripts when possible).
 */
export interface AggregateInterviewTranscript {
  interviewId: string;
  // Friendly attribution label, e.g. "Interview 3" or "P-07".
  attribution: string;
  // Already-formatted "PARTICIPANT: ... / INTERVIEWER: ..." text. Each turn
  // line should start with a "[turn:N]" prefix so the model can cite turnId.
  transcript: string;
}

export const buildAggregateSynthesisPrompt = (
  studyConfig: StudyConfig,
  syntheses: SynthesisResult[],
  interviewCount: number,
  interviewTranscripts?: AggregateInterviewTranscript[]
): string => {
  const synthesesText = syntheses.map((s, i) => {
    const themes = s.themes.map(t => `${t.theme} (${t.frequency}x): ${t.evidence}`).join('\n    - ');
    const surprises = (s.surprisingMoments || []).join('; ') || 'None noted';
    return `--- Interview ${i + 1} ---
Bottom line: ${s.bottomLine}
Stated: ${s.statedPreferences.join('; ') || 'None'}
Revealed: ${s.revealedPreferences.join('; ') || 'None'}
Themes:
    - ${themes || 'None extracted'}
Contradictions: ${s.contradictions.join('; ') || 'None'}
Key insights: ${s.keyInsights.join('; ') || 'None'}
Surprises (topics raised, not asked): ${surprises}`;
  }).join('\n\n');

  const transcriptsBlock = interviewTranscripts && interviewTranscripts.length
    ? `\n\nFULL TRANSCRIPTS (use these to pull verbatim quotes with interviewId + turnId attribution):

${interviewTranscripts.map(t => `=== ${t.attribution} (interviewId: ${t.interviewId}) ===
${t.transcript}`).join('\n\n')}`
    : '\n\n(No raw transcripts provided. Use evidence quotes from the per-interview syntheses above and attribute by interview index. Set turnId to null in those cases.)';

  const questionList = studyConfig.coreQuestions.length
    ? studyConfig.coreQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  (none configured)';

  return `You are the Synthesizer for Heard, an AI research tool. You are analyzing ${interviewCount} interviews together to ANSWER the researcher's original question.

THE RESEARCHER ASKED: "${studyConfig.researchQuestion}"

The interviews below should answer it. Open your output with the original question echoed verbatim into the originalQuestion field, then give a direct 2-3 sentence answer in theAnswer, then evidence (5-10 verbatim quotes), then a per-question breakdown, then surprises (topics respondents kept raising that weren't asked), then confidence.

QUESTIONS ASKED IN EACH INTERVIEW:
${questionList}

PER-INTERVIEW SYNTHESES:
${synthesesText}${transcriptsBlock}

WHAT YOU MUST PRODUCE

The output is structured. Fill every field. The v2 fields (originalQuestion, theAnswer, evidence, perQuestionAnswers, surprises, confidence, confidenceReason) are the headline output. The v1 fields (commonThemes, divergentViews, keyFindings, researchImplications, bottomLine) are still required so existing dashboards and follow-up generation keep working — populate them too, derived from the same evidence.

V2 FIELDS (the headline):

1. originalQuestion — Echo "${studyConfig.researchQuestion}" verbatim. Do not rephrase it.

2. theAnswer — 2 to 3 sentences that DIRECTLY answer the original question. Not a summary of themes. An answer. If the evidence is mixed, say so plainly ("Most participants said X, but a vocal minority said Y."). If the evidence doesn't support a clear answer, say that ("The interviews don't answer this question directly — here's the closest thing the data supports.").

3. evidence — 5 to 10 verbatim quotes from the transcripts that support theAnswer. Each entry has:
   - quote: the exact words the participant said. No paraphrasing.
   - interviewId: the id from the transcripts block above (or "interview-{index}" if transcripts weren't provided).
   - turnId: the turn number from the [turn:N] prefix in the transcript, or null if not available.
   - attribution: a short human label like "Interview 3" or the provided attribution string.

4. perQuestionAnswers — One entry per question in QUESTIONS ASKED. Each entry has:
   - question: the question verbatim.
   - answer: 1 to 2 sentences synthesizing what respondents collectively said to that question.
   - supportingQuotes: 1 to 3 verbatim quotes (each with quote, interviewId, optional turnId).

5. surprises — Topics respondents kept raising that the questions did NOT ask about. Each entry has:
   - topic: a short label.
   - frequency: how many interviews raised it unprompted.
   - exampleQuote: one verbatim quote.
   Empty array is valid if nothing surfaced.

6. confidence — "high" if N>=8 and the evidence converges; "medium" if N is small or the evidence is mixed; "low" if N is tiny or the answers are scattered.

7. confidenceReason — One sentence on WHY you set the confidence level. Reference interview count, evidence convergence, and any caveats.

V1 FIELDS (still required for backward compatibility):

8. commonThemes — Patterns appearing across multiple interviews. Each entry: { theme, frequency, representativeQuotes (verbatim, 1-3 strings) }.
9. divergentViews — Areas where participants disagreed. Each entry: { topic, viewA, viewB }. Empty array is fine if there's broad consensus.
10. keyFindings — 3 to 5 of the most important discoveries. Plain language, not corporate.
11. researchImplications — What these findings mean for what the researcher should do next.
12. bottomLine — One paragraph (3-5 sentences) summarizing the answer. This is the legacy summary. theAnswer is the headline; bottomLine can elaborate on it.

RULES

- Quote verbatim. Do not "clean up" participant language. Typos and casual phrasing stay.
- Do not invent quotes. Every quote in evidence and supportingQuotes must come from the transcripts or the per-interview evidence strings.
- Be honest about thin or scattered evidence. Low confidence is a useful answer; faking certainty is not.
- No corporate language. No "stakeholders", "leverage", "deep dive", "actionable insights".`;
};

/**
 * Output schema description (informational). Mirrors the v2 shape in
 * AggregateSynthesisResult.
 */
export const aggregateSynthesisOutputDescription = `
Expected output structure (matches AggregateSynthesisResult in src/types.ts):
{
  "originalQuestion": "<verbatim echo of researcher's question>",
  "theAnswer": "2-3 sentence direct answer",
  "evidence": [
    { "quote": "verbatim", "interviewId": "...", "turnId": 12, "attribution": "Interview 3" }
  ],
  "perQuestionAnswers": [
    {
      "question": "<question text>",
      "answer": "1-2 sentence synthesized answer",
      "supportingQuotes": [{ "quote": "verbatim", "interviewId": "...", "turnId": 7 }]
    }
  ],
  "surprises": [
    { "topic": "Short label", "frequency": 3, "exampleQuote": "verbatim" }
  ],
  "confidence": "high | medium | low",
  "confidenceReason": "One-sentence justification",

  // v1 fields (still required for backward compat with existing UI):
  "commonThemes": [
    { "theme": "...", "frequency": 4, "representativeQuotes": ["verbatim", "verbatim"] }
  ],
  "divergentViews": [
    { "topic": "...", "viewA": "...", "viewB": "..." }
  ],
  "keyFindings": ["..."],
  "researchImplications": ["..."],
  "bottomLine": "Paragraph-length summary"
}
`;
