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
    <div className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Slow breath-rhythm gradient. Sits behind everything, signals
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
              'radial-gradient(circle, rgba(120,113,108,0.35) 0%, rgba(68,64,60,0.18) 45%, transparent 75%)',
          }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative w-full max-w-[480px] flex flex-col items-center text-center"
      >
        {/* Optional brand logo. Plain <img> on purpose: this is sometimes
            an arbitrary external URL and we don't want to maintain an
            allowlist in next.config.js. Phase 3 will replace this with a
            proper upload pipeline. */}
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

        {/* Brand line with a subtle pulsing dot to its left. Dot reads as a
            living conversation indicator without being noisy. */}
        <div className="flex items-center gap-3 mb-8">
          <motion.span
            aria-hidden
            className="w-2 h-2 rounded-full bg-stone-300"
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.05, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-stone-50 leading-snug">
            {displayBrand} {brandName ? 'is' : 'are'} asking for your perspective.
          </h1>
        </div>

        {/* Three-line framing. Time + anonymity + exit clause, the three
            biggest objections answered upfront before they arise. */}
        <div className="text-stone-400 text-base sm:text-[17px] leading-relaxed space-y-1 mb-10">
          <p>About 5 minutes.</p>
          <p>Anonymous unless you say your name.</p>
          <p>You can stop anytime.</p>
        </div>

        {/* Study name as quiet subtext, only when present and short enough
            to feel like context, not a header. */}
        {studyConfig.name && (
          <p className="text-stone-500 text-sm mb-10 max-w-sm">
            About: {studyConfig.name}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full py-4 rounded-full bg-stone-100 text-stone-900 font-medium text-base hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {starting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Starting
            </>
          ) : (
            'Start'
          )}
        </button>

        <p className="mt-12 text-stone-600 text-xs tracking-wide">
          Powered by Heard
        </p>
      </motion.div>
    </div>
  );
};

export default ParticipantLanding;
