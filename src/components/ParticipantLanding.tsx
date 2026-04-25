'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { StudyConfig } from '@/types';

interface ParticipantLandingProps {
  token: string;
  studyConfig: StudyConfig;
  brandName?: string;
  brandLogoUrl?: string;
}

// Single landing screen for participants. Combines what used to be
// separate consent + begin-interview screens into one warm, low-pressure
// page. Click "Start" = consent recorded + redirect to /interview.
const ParticipantLanding: React.FC<ParticipantLandingProps> = ({
  token,
  studyConfig,
  brandName,
  brandLogoUrl,
}) => {
  const router = useRouter();
  const { setStudyConfig, setParticipantToken, setViewMode, giveConsent, initializeProfile, setStep, resetParticipant } = useStore();
  const [starting, setStarting] = useState(false);

  // Default brand name. "We" feels personal and avoids the awkward
  // "Researcher is asking..." placeholder when nothing is provided.
  const displayBrand = brandName?.trim() || 'We';

  const handleStart = () => {
    if (starting) return;
    setStarting(true);

    // Hydrate the store so InterviewChat (which reads from store) has
    // everything it needs: study config, token, participant view mode,
    // a fresh profile, and consent recorded.
    resetParticipant();
    setStudyConfig(studyConfig);
    setParticipantToken(token);
    setViewMode('participant');
    giveConsent();
    if (studyConfig.profileSchema) {
      initializeProfile(studyConfig.profileSchema);
    }
    setStep('interview');

    router.push('/interview');
  };

  return (
    <main className="heard-surface min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Slow breath-rhythm warm glow. Sits behind everything, signals
          "conversation, not form." */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0.35 }}
        animate={{ opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          className="w-[600px] h-[600px] max-w-[90vw] max-h-[90vw] rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(139,107,79,0.18) 0%, rgba(139,107,79,0.08) 45%, transparent 75%)',
          }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative w-full max-w-[520px] flex flex-col items-center text-center"
      >
        {brandLogoUrl && (
          <div className="mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brandLogoUrl}
              alt={`${displayBrand} logo`}
              className="max-h-16 w-auto object-contain"
            />
          </div>
        )}

        {/* Brand line — Fraunces serif, larger, restrained motion dot. */}
        <div className="flex items-center gap-3 mb-10">
          <motion.span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.05, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <h1
            className="heard-ai"
            style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.3 }}
          >
            {displayBrand} {brandName ? 'is' : 'are'} asking for your perspective.
          </h1>
        </div>

        <div
          className="text-base leading-relaxed space-y-1 mb-12"
          style={{ color: 'var(--ink-muted)' }}
        >
          <p>about five minutes.</p>
          <p>anonymous unless you say your name.</p>
          <p>you can stop anytime.</p>
        </div>

        {studyConfig.name && (
          <p
            className="text-sm mb-10 max-w-sm"
            style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}
          >
            on: {studyConfig.name}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={starting}
          className="px-12 py-3 rounded-full font-medium text-sm tracking-wide transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:translate-y-[-1px]"
          style={{
            background: 'var(--ink-primary)',
            color: 'var(--paper-bg)',
            letterSpacing: '0.05em',
          }}
        >
          {starting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              starting
            </>
          ) : (
            'begin'
          )}
        </button>

        <p
          className="mt-16 text-[10px] tracking-[0.25em] uppercase"
          style={{ color: 'var(--ink-faint)' }}
        >
          powered by heard
        </p>
      </motion.div>
    </main>
  );
};

export default ParticipantLanding;
