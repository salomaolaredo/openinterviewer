'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import {
  generateInterviewResponse,
  getInterviewGreeting
} from '@/services/geminiService';
import { InterviewMessage } from '@/types';
import { ArrowRight } from 'lucide-react';

// Word-by-word reveal for AI questions: each word fades + drifts in
// over 360ms with a 28ms stagger. Slow enough to read as it appears,
// fast enough that the whole sentence settles in well under a second
// for typical interview-question lengths.
const renderWordByWord = (text: string) => {
  const words = text.split(/(\s+)/); // keep whitespace tokens
  let wordIndex = 0;
  return words.map((token, i) => {
    if (/^\s+$/.test(token)) return <React.Fragment key={i}>{token}</React.Fragment>;
    const delay = wordIndex * 28;
    wordIndex += 1;
    return (
      <span
        key={i}
        className="heard-word"
        style={{ animationDelay: `${delay}ms` }}
      >
        {token}
      </span>
    );
  });
};

const InterviewChat: React.FC = () => {
  const router = useRouter();
  const {
    studyConfig,
    participantProfile,
    questionProgress,
    interviewHistory,
    addMessage,
    setStep,
    isAiThinking,
    setAiThinking,
    contextEntries,
    appendContext,
    setInterviewPhase,
    markQuestionAsked,
    completeInterview,
    updateProfileField,
    setProfileRawContext,
    participantToken
  } = useStore();

  const [input, setInput] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [showFinishOption, setShowFinishOption] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewHistory, isAiThinking]);

  // Show finish option after background phase
  useEffect(() => {
    if (questionProgress.currentPhase !== 'background') {
      setShowFinishOption(true);
    }
  }, [questionProgress.currentPhase]);

  // Initialize with greeting (run once per studyConfig).
  //
  // NOTE: do NOT use a `let mounted` flag here. React 18 StrictMode mounts the
  // effect twice in dev; the cleanup of the first pass sets the closure's
  // `mounted = false` BEFORE the API response lands. If we gate state updates
  // on `mounted`, the response is silently dropped and the UI hangs on
  // "Thinking..." forever. Zustand updates are idempotent — the worst case of
  // running them on a "stale" render is that they no-op or set the same
  // greeting twice (and Zustand dedupes via the `initialized` flag we own).
  useEffect(() => {
    const initialize = async () => {
      if (!studyConfig || initialized || interviewHistory.length > 0) return;

      setInitialized(true);
      setAiThinking(true);

      try {
        const greeting = await getInterviewGreeting(studyConfig, participantToken);
        if (!greeting) {
          // Defensive: API succeeded but returned empty. Don't leave the user
          // staring at "Thinking..." — surface a fallback so they can proceed.
          throw new Error('Empty greeting response');
        }
        const msg: InterviewMessage = {
          id: `msg-${Date.now()}`,
          role: 'ai',
          content: greeting,
          timestamp: Date.now(),
        };
        addMessage(msg);
      } catch (error) {
        console.error('Error initializing interview:', error);
        // Friendly fallback so the participant can still talk.
        addMessage({
          id: `msg-${Date.now()}`,
          role: 'ai',
          content:
            "hey. thanks for taking a few minutes. could you start by telling me a bit about yourself?",
          timestamp: Date.now(),
        });
      } finally {
        setAiThinking(false);
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyConfig?.id]);

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim() || !studyConfig) return;

    // Add user message
    const userMsg: InterviewMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    addMessage(userMsg);
    setInput('');

    // Also save to context
    appendContext(text, 'text');

    // Generate AI response
    setAiThinking(true);

    try {
      const currentContext = contextEntries.map(e => e.text).join('\n');
      const updatedHistory = [...interviewHistory, userMsg];

      const response = await generateInterviewResponse(
        updatedHistory,
        studyConfig,
        participantProfile,
        questionProgress,
        currentContext,
        participantToken
      );

      // Handle profile updates
      if (response.profileUpdates && response.profileUpdates.length > 0) {
        response.profileUpdates.forEach(update => {
          updateProfileField(update.fieldId, update.value, update.status);
        });

        // Update raw context with user's background info
        if (questionProgress.currentPhase === 'background') {
          const existingContext = participantProfile?.rawContext || '';
          const newContext = existingContext + (existingContext ? '\n' : '') + text;
          setProfileRawContext(newContext);
        }
      }

      // Handle phase transition
      if (response.phaseTransition) {
        setInterviewPhase(response.phaseTransition);
      }

      // Handle question progress
      if (response.questionAddressed !== null && response.questionAddressed !== undefined) {
        markQuestionAsked(response.questionAddressed);
      }

      // Add AI message
      const aiMsg: InterviewMessage = {
        id: `msg-${Date.now()}`,
        role: 'ai',
        content: response.message,
        timestamp: Date.now()
      };
      addMessage(aiMsg);

      // Handle interview conclusion
      if (response.shouldConclude) {
        completeInterview();
      }
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMsg: InterviewMessage = {
        id: `msg-${Date.now()}`,
        role: 'ai',
        content: "I appreciate you sharing that. Could you tell me more?",
        timestamp: Date.now()
      };
      addMessage(errorMsg);
    } finally {
      setAiThinking(false);
    }
  };

  const handleFinishEarly = () => {
    completeInterview();
  };

  const handleViewAnalysis = () => {
    setStep('synthesis');
    router.push('/synthesis');
  };

  if (!studyConfig) {
    return (
      <main className="heard-surface min-h-screen flex items-center justify-center">
        <p className="text-[var(--ink-muted)] heard-ai" style={{ fontSize: '1rem' }}>
          no conversation to load.
        </p>
      </main>
    );
  }

  const totalQuestions = studyConfig.coreQuestions.length;
  const questionsCompleted = questionProgress.questionsAsked.length;
  const isComplete = questionProgress.isComplete;
  const progressPct = totalQuestions
    ? Math.min(100, Math.round((questionsCompleted / totalQuestions) * 100))
    : 0;
  const brandLine = studyConfig.name?.trim() || 'a brief conversation';

  return (
    <main className="heard-surface flex flex-col h-screen">
      {/* Top hairline + brand line. No header chrome, no phase pills. */}
      <header className="px-6 pt-6 pb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)] font-medium">
          {brandLine}
        </p>
        {showFinishOption && !isComplete && (
          <button
            onClick={handleFinishEarly}
            className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
          >
            end here
          </button>
        )}
      </header>

      {/* Conversation column — narrow, reading-comfortable. No bubbles. */}
      <section className="flex-1 overflow-y-auto px-6 pt-12 pb-16">
        <div className="max-w-[640px] mx-auto space-y-10">
          {interviewHistory.map((msg) => (
            <div key={msg.id} className="space-y-1">
              {msg.role === 'ai' ? (
                <p className="heard-ai">{renderWordByWord(msg.content)}</p>
              ) : (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="heard-you"
                >
                  {msg.content}
                </motion.p>
              )}
            </div>
          ))}

          {/* Thinking indicator: three serif dots, breathing. No spinner, no label. */}
          {isAiThinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="heard-breath"
              aria-label="Heard is thinking"
            >
              <span>·</span>
              <span>·</span>
              <span>·</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </section>

      {/* Hairline progress bar — no labels, no percentages. */}
      <div
        className="heard-progress mx-6"
        style={{ ['--progress' as string]: `${progressPct}%` }}
        aria-hidden="true"
      />

      {/* Input rail or completion. Borderless. */}
      {isComplete ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="px-6 py-12"
        >
          <div className="max-w-[640px] mx-auto">
            <p className="heard-ai" style={{ fontSize: '1.25rem', color: 'var(--ink-soft)' }}>
              thanks for taking the time. your words have been saved.
            </p>
            <button
              onClick={handleViewAnalysis}
              className="mt-6 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
            >
              see what you said <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!isAiThinking) handleSend(); }}
          className="px-6 py-6 bg-[var(--paper-bg-soft)]"
        >
          <div className="max-w-[640px] mx-auto flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter or plain Enter (without shift) sends.
                if (e.key === 'Enter' && !e.shiftKey && !isAiThinking) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onInput={(e) => {
                // Auto-grow up to ~6 lines
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              placeholder="say what's on your mind…"
              disabled={isAiThinking}
              rows={1}
              className="flex-1 bg-transparent border-0 outline-none resize-none text-[1.0625rem] leading-[1.65] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] py-2"
              style={{ fontFamily: 'Inter, sans-serif', maxHeight: '160px' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isAiThinking}
              className="heard-send p-2"
              aria-label="Send"
            >
              <ArrowRight size={20} strokeWidth={1.5} />
            </button>
          </div>
        </form>
      )}
    </main>
  );
};

export default InterviewChat;
