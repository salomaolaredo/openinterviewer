// Research Interview Tool Types

// ============================================
// Interview Phase & Progress Tracking
// ============================================

export type InterviewPhase =
  | 'background'      // AI gathers participant context
  | 'core-questions'  // Working through core research questions
  | 'exploration'     // Optional deeper exploration
  | 'feedback'        // Final feedback for researchers
  | 'wrap-up';        // AI concludes, interview complete

export interface QuestionProgress {
  questionsAsked: number[];  // Indices of completed questions
  total: number;
  currentPhase: InterviewPhase;
  isComplete: boolean;
}

// ============================================
// Profile Schema - Researcher-defined fields
// ============================================

export interface ProfileField {
  id: string;
  label: string;              // e.g., "Current Role"
  extractionHint: string;     // e.g., "Their job title or position"
  required: boolean;
  options?: string[];         // Optional preset options for validation
}

export type ProfileFieldStatus = 'pending' | 'extracted' | 'vague' | 'refused';

export interface ProfileFieldValue {
  fieldId: string;
  value: string | null;
  status: ProfileFieldStatus;
  extractedAt?: number;
}

export interface ParticipantProfile {
  id: string;
  fields: ProfileFieldValue[];  // Structured field values
  rawContext: string;           // Full context summary from conversation
  timestamp: number;
}

// ============================================
// Study Configuration
// ============================================

export type AIBehavior = 'structured' | 'standard' | 'exploratory';

export type AIProviderType = 'gemini' | 'claude';

// ============================================
// AI Model Configuration
// ============================================

export interface AIModelOption {
  id: string;
  label: string;
  desc: string;
}

// Available Gemini models (verified from official docs)
export const GEMINI_MODELS: AIModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fast, cost-effective' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Higher quality' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', desc: 'Most intelligent (preview)' },
];

// Available Claude models (verified from official docs)
export const CLAUDE_MODELS: AIModelOption[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Fastest ($1/$5 per MTok)' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', desc: 'Balanced ($3/$15 per MTok)' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', desc: 'Most capable ($15/$75 per MTok)' },
];

// Default models for each provider
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';

// Synthesis models (auto-upgrade to best available for reasoning tasks)
export const GEMINI_SYNTHESIS_MODEL = 'gemini-3-pro-preview';
export const CLAUDE_SYNTHESIS_MODEL = 'claude-opus-4-5';

// Link expiration options
export type LinkExpirationOption = 'never' | '7days' | '30days' | '90days';

export interface StudyConfig {
  id: string;
  name: string;
  description: string;
  researchQuestion: string;
  coreQuestions: string[];
  topicAreas: string[];           // General topic areas for synthesis
  profileSchema: ProfileField[];  // Fields to collect during interview
  aiBehavior: AIBehavior;
  aiProvider?: AIProviderType;    // Optional, defaults to env or 'gemini'
  aiModel?: string;               // Optional, defaults to provider-specific env or default
  consentText: string;
  createdAt: number;
  // Follow-up study lineage
  parentStudyId?: string;         // ID of parent study if this is a follow-up
  parentStudyName?: string;       // Name of parent study for display
  generatedFrom?: 'synthesis' | 'manual';  // How this study was created
  // Link management
  linksEnabled?: boolean;         // Whether participant links are active (default: true)
  linkExpiration?: LinkExpirationOption;  // When links expire (default: 'never')
  // AI Reasoning
  enableReasoning?: boolean;      // undefined=auto, true=force on, false=force off
}

// ============================================
// Interview Messages
// ============================================

export interface InterviewMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  timestamp: number;
}

// ============================================
// Behavior & Analysis Data
// ============================================

export interface BehaviorData {
  timePerTopic: Record<string, number>;
  messagesPerTopic: Record<string, number>;
  topicsExplored: string[];
  contradictions: string[];
}

export interface SynthesisResult {
  statedPreferences: string[];
  revealedPreferences: string[];
  themes: { theme: string; evidence: string; frequency: number }[];
  contradictions: string[];
  keyInsights: string[];
  bottomLine: string;
  // v2 (Heard) additions — optional so existing data and UI keep working.
  // Topics the participant raised that the questions didn't ask about.
  surprisingMoments?: string[];
  // The original researcher question, echoed for context. Used by the
  // per-interview synthesizer when framing this interview's contribution.
  originalQuestion?: string;
}

// ============================================
// App State
// ============================================

export type AppStep =
  | 'setup'        // Researcher configures study
  | 'consent'      // Participant sees consent + foreshadowing
  | 'interview'    // Main interview chat (includes background gathering)
  | 'synthesis'    // Analysis results
  | 'export';      // Export data

export type ViewMode = 'researcher' | 'participant';

export interface ContextEntry {
  id: string;
  text: string;
  source: 'text' | 'system';
  timestamp: number;
}

// ============================================
// AI Response Structure (for API routes)
// ============================================

export interface AIInterviewResponse {
  message: string;
  questionAddressed: number | null;     // Which core question was covered (0-indexed)
  phaseTransition: InterviewPhase | null;  // If moving to new phase
  profileUpdates: {
    fieldId: string;
    value: string | null;
    status: 'extracted' | 'vague' | 'refused';
  }[];
  shouldConclude: boolean;              // AI signals interview should end
}

// ============================================
// Stored Interview (Vercel KV)
// ============================================

export interface StoredInterview {
  id: string;
  studyId: string;
  studyName: string;
  participantProfile: ParticipantProfile;
  transcript: InterviewMessage[];
  synthesis: SynthesisResult | null;
  behaviorData: BehaviorData;
  createdAt: number;
  completedAt: number;
  status: 'in_progress' | 'completed';
}

// ============================================
// Participant Token (URL)
// ============================================

export interface ParticipantToken {
  studyId: string;
  studyConfig: StudyConfig;
  createdAt: number;
  expiresAt?: number;
}

// ============================================
// Stored Study (Vercel KV)
// ============================================

export interface StoredStudy {
  id: string;                    // Server-assigned UUID
  config: StudyConfig;           // Full study configuration
  createdAt: number;
  updatedAt: number;
  interviewCount: number;        // Cached count for dashboard display
  isLocked: boolean;             // True after first interview collected
  // v2 (Heard) — populated by the conversational study creator. Optional/nullable
  // so v1 paths and demo data still load without these.
  originalQuestion?: string | null;
  creationThread?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> | null;
  aggregateSynthesis?: AggregateSynthesisResult | null;
}

// ============================================
// Aggregate Synthesis (Cross-Interview)
// ============================================

export interface AggregateSynthesisResult {
  studyId: string;
  interviewCount: number;
  // v1 fields — kept required so existing callers (followup generation, dashboard)
  // don't break. The v2 prompt is responsible for populating them alongside the
  // new v2 fields below.
  commonThemes: { theme: string; frequency: number; representativeQuotes: string[] }[];
  divergentViews: { topic: string; viewA: string; viewB: string }[];
  keyFindings: string[];
  researchImplications: string[];
  bottomLine: string;           // One-paragraph summary of all interviews
  generatedAt: number;

  // ============================================
  // v2 (Heard) — question-echo synthesis shape
  // ============================================
  // The researcher's natural-language goal, echoed verbatim as the report opener.
  originalQuestion?: string;
  // 2-3 sentences directly answering the original question.
  theAnswer?: string;
  // 5-10 verbatim quotes pulled from interview transcripts.
  evidence?: AggregateEvidenceQuote[];
  // For each question the researcher asked, a synthesized answer + quotes.
  perQuestionAnswers?: AggregatePerQuestionAnswer[];
  // Topics respondents kept raising that weren't asked about.
  surprises?: AggregateSurprise[];
  // Confidence in the answer given the evidence.
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
}

export interface AggregateEvidenceQuote {
  quote: string;
  interviewId: string;
  turnId?: number;
  // Short label like "Interview 3" or a participant pseudonym.
  attribution: string;
}

export interface AggregatePerQuestionAnswer {
  question: string;
  answer: string;
  supportingQuotes: { quote: string; interviewId: string; turnId?: number }[];
}

export interface AggregateSurprise {
  topic: string;
  // How many interviews raised this unprompted.
  frequency: number;
  exampleQuote: string;
}
