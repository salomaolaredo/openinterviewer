// Researcher Context Resolution (standalone-only)
// Single-tenant: every request resolves to env-var-based credentials.
// The `ResearcherContext` shape is preserved so existing route code compiles
// without rewrites. Fields related to hosted mode (kvClient, researcherId)
// have been removed.

import { cookies } from 'next/headers';
import { verifySessionToken, verifyParticipantToken, SESSION_COOKIE_NAME } from './auth';
import { getStudy } from './kv';

export interface ResearcherContext {
  // AI API keys resolved from env vars.
  geminiApiKey: string | null;
  anthropicApiKey: string | null;

  // Always true in standalone mode — onboarding is not a concept here.
  onboardingComplete: boolean;
}

// Standalone context: reads env vars.
function getStandaloneContext(): ResearcherContext {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    onboardingComplete: true,
  };
}

// ============================================
// For researcher/admin API routes
// ============================================

export interface RequestContextResult {
  authorized: boolean;
  context: ResearcherContext | null;
  error?: string;
}

export async function getRequestContext(): Promise<RequestContextResult> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!authCookie?.value) {
    return { authorized: false, context: null, error: 'Unauthorized' };
  }

  const session = await verifySessionToken(authCookie.value);
  if (!session.valid) {
    return { authorized: false, context: null, error: 'Session expired or invalid' };
  }

  return {
    authorized: true,
    context: getStandaloneContext(),
  };
}

// ============================================
// For participant API routes
// ============================================

export interface ParticipantContextResult {
  valid: boolean;
  context: ResearcherContext | null;
  studyId?: string;
  isAdmin?: boolean;
  error?: string;
}

export async function getParticipantRequestContext(
  request: Request
): Promise<ParticipantContextResult> {
  const auth = await verifyParticipantToken(request);

  if (!auth.valid) {
    return { valid: false, context: null, error: auth.error };
  }

  // Admin preview: also use standalone context.
  if (auth.isAdmin) {
    return { valid: true, context: getStandaloneContext(), isAdmin: true };
  }

  // Check if links are disabled for this study
  if (auth.studyId) {
    const study = await getStudy(auth.studyId);
    if (study && study.config.linksEnabled === false) {
      return {
        valid: false,
        context: null,
        error: 'Participant links have been disabled for this study.',
      };
    }
  }

  return {
    valid: true,
    context: getStandaloneContext(),
    studyId: auth.studyId,
  };
}
