// AI Provider Factory
// Returns the appropriate provider based on study or environment configuration

import { AIProvider } from '../ai';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';
import { StudyConfig } from '@/types';

export type ProviderType = 'gemini' | 'claude';

// Optional API keys passed from the researcher context (standalone reads env vars)
export interface AIProviderKeys {
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
}

// Get the interview AI provider based on configuration
// Provider priority: studyConfig.aiProvider > env.AI_PROVIDER > 'gemini'
// Model priority: studyConfig.aiModel > env.GEMINI_MODEL/CLAUDE_MODEL > env.AI_MODEL > default
export function getInterviewProvider(studyConfig?: StudyConfig, keys?: AIProviderKeys): AIProvider {
  const providerType = (
    studyConfig?.aiProvider ||
    process.env.AI_PROVIDER ||
    'gemini'
  ) as ProviderType;

  const model = studyConfig?.aiModel;

  switch (providerType) {
    case 'claude': {
      const key = keys?.anthropicApiKey ?? undefined;
      return new ClaudeProvider(model, key);
    }
    case 'gemini':
    default: {
      const key = keys?.geminiApiKey ?? undefined;
      return new GeminiProvider(model, key);
    }
  }
}

export { GeminiProvider } from './gemini';
export { ClaudeProvider } from './claude';
