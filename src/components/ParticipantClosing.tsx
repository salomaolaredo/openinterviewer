'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import { synthesizeInterview } from '@/services/geminiService';
import { saveCompletedInterview } from '@/services/storageService';
import type { SynthesisResult } from '@/types';

/**
 * Shown to the participant immediately after they finish the interview.
 *
 * Two jobs running quietly underneath:
 *  1. Save the completed interview (so the researcher sees it).
 *  2. Run per-interview synthesis (so we can show the participant
 *     a small "here's what I heard from you" reflection).
 *
 * The screen never blocks on either. If save or synthesis fails, we
 * still close warmly — the participant should never see infrastructure.
 *
 * Uncommon-care principle: the participant gets something back. Most
 * research tools say "thanks for your time" and that's it. Heard tells
 * them what was heard, in their own words, before they leave.
 */
const ParticipantClosing: React.FC = () => {
  const {
    studyConfig,
    interviewHistory,
    behaviorData,
    participantProfile,
    participantToken,
    synthesis,
    setSynthesis,
  } = useStore();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const ranRef = useRef(false);

  // Run synthesis + save once, on mount. The interview is locked at this
  // point so re-running buys us nothing.
  useEffect(() => {
    if (ranRef.current) return;
    if (!studyConfig || interviewHistory.length === 0) return;
    ranRef.current = true;

    const run = async () => {
      setIsAnalyzing(true);
      try {
        const result = await synthesizeInterview(
          interviewHistory,
          studyConfig,
          behaviorData,
          participantProfile,
          participantToken
        );
        setSynthesis(result);

        // Fire-and-forget save. We don't surface save errors to the
        // participant — the researcher will see the missing interview
        // in their dashboard if the save failed and can re-export.
        const interviewId = participantProfile?.id || `interview-${Date.now()}`;
        await saveCompletedInterview(
          {
            id: interviewId,
            studyId: studyConfig.id,
            studyName: studyConfig.name,
            participantProfile: participantProfile || {
              id: interviewId,
              fields: [],
              rawContext: '',
              timestamp: Date.now(),
            },
            transcript: interviewHistory,
            synthesis: result,
            behaviorData,
            createdAt: Date.now(),
          },
          participantToken
        ).catch((err) => {
          // Log but don't surface — see comment above.
          // eslint-disable-next-line no-console
          console.error('Background save failed:', err);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Synthesis failed:', err);
        setAnalysisError(true);
      } finally {
        setIsAnalyzing(false);
      }
    };

    run();
    // Intentionally omit setSynthesis from deps; ref guards re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Display data: prefer the freshly-computed synthesis; fall back to whatever
  // is in the store; render gracefully if both are missing.
  const themes = (synthesis?.themes ?? []).slice(0, 3);
  const bottomLine = synthesis?.bottomLine?.trim();
  const surprises = (synthesis?.surprisingMoments ?? []).slice(0, 2);

  return (
    <main className="heard-surface min-h-screen flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[640px]"
      >
        {/* Big serif thanks. Singular, warm. */}
        <h1
          className="heard-ai mb-10"
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
            lineHeight: 1.05,
            fontWeight: 300,
            letterSpacing: '-0.02em',
          }}
        >
          thanks.
        </h1>

        {/* Loading: a single line in serif. No spinner — the breathing dots
            from the chat were enough; this is a reflection, not a fetch. */}
        {isAnalyzing && !bottomLine && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="heard-ai"
            style={{ fontSize: '1.125rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}
          >
            taking a moment to read back what you said
            <span className="heard-breath ml-1" style={{ fontSize: '1rem' }}>
              <span>·</span>
              <span>·</span>
              <span>·</span>
            </span>
          </motion.p>
        )}

        {/* The reflection — what we heard. */}
        {bottomLine && !isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="text-[11px] uppercase tracking-[0.2em] mb-5"
              style={{ color: 'var(--ink-muted)' }}
            >
              what we heard
            </p>
            <p
              className="heard-ai mb-12"
              style={{ fontSize: '1.375rem', color: 'var(--ink-soft)', lineHeight: 1.55 }}
            >
              {bottomLine}
            </p>

            {themes.length > 0 && (
              <div className="space-y-8 mb-12 pt-8" style={{ borderTop: '1px solid var(--ink-faint)' }}>
                {themes.map((t, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
                  >
                    <p
                      className="font-serif italic mb-2"
                      style={{ fontSize: '1.125rem', color: 'var(--ink-primary)', lineHeight: 1.5 }}
                    >
                      {t.theme}
                    </p>
                    {t.evidence && (
                      <p
                        className="heard-you"
                        style={{
                          fontSize: '0.95rem',
                          fontStyle: 'italic',
                          paddingLeft: '1rem',
                          borderLeftColor: 'var(--ink-faint)',
                        }}
                      >
                        {t.evidence}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}

            {surprises.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="mb-12 pt-8"
                style={{ borderTop: '1px solid var(--ink-faint)' }}
              >
                <p
                  className="text-[11px] uppercase tracking-[0.2em] mb-3"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  unexpected
                </p>
                {surprises.map((s, i) => (
                  <p
                    key={i}
                    className="font-serif mb-2"
                    style={{ fontSize: '1rem', color: 'var(--ink-soft)', lineHeight: 1.55 }}
                  >
                    {s}
                  </p>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Error fallback — still warm. */}
        {analysisError && !bottomLine && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="heard-ai"
            style={{ fontSize: '1.125rem', color: 'var(--ink-soft)' }}
          >
            your responses were heard. the reflection couldn&apos;t finish loading,
            but everything you said is saved.
          </motion.p>
        )}

        {/* Final line. Calm, no CTA. They're done. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: bottomLine ? 0.9 : 1.5, duration: 0.6 }}
          className="text-[11px] uppercase tracking-[0.2em] mt-16"
          style={{ color: 'var(--ink-muted)' }}
        >
          your responses are saved · you can close this tab
        </motion.p>
      </motion.div>
    </main>
  );
};

export default ParticipantClosing;
