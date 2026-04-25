'use client';

/**
 * QuestionMakerChat
 *
 * The conversational study creator. Researcher arrives at /new, sees a single
 * Heard greeting, types their research goal, and Heard either probes a few
 * times or proposes a study via tool_use.
 *
 * When a proposal arrives, the StudyDraftPanel renders alongside (or below
 * on mobile) and the conversation can continue if the researcher wants
 * revisions — the panel reflects the most recent proposal.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

import StudyDraftPanel from './StudyDraftPanel';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ProposalShape {
  questions: string[];
  audience: string;
  northStar: string;
  studyName: string;
}

const INITIAL_GREETING: ChatMessage = {
  role: 'assistant',
  content: "hey. what are you trying to learn from your customers?",
  timestamp: Date.now(),
};

const QuestionMakerChat: React.FC = () => {
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalShape | null>(null);
  const [originalQuestion, setOriginalQuestion] = useState<string>('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setError(null);

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    // Capture the first user message as the "original question" — this is
    // what the synthesis report will echo back.
    if (!originalQuestion) {
      setOriginalQuestion(trimmed);
    }

    // Optimistically render the user message; send the *previous* thread + new message.
    const threadForApi = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/question-maker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread: threadForApi,
          message: trimmed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'something went wrong. try again?');
        return;
      }

      const reply: string = data.reply || '';
      const newProposal: ProposalShape | undefined = data.proposal;

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (newProposal) {
        setProposal(newProposal);
      }
    } catch {
      setError('connection error. try again.');
    } finally {
      setSending(false);
      // Refocus the input
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaved = (studyId: string) => {
    // Lightweight redirect to the study detail page after save.
    // (The user sees the share link inline first; this is a follow-up nudge.)
    setTimeout(() => {
      router.push(`/studies/${studyId}`);
    }, 4000);
  };

  // Build the thread we'd persist as creation_thread (everything visible).
  const creationThread = messages;

  const hasProposal = !!proposal;

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-stone-100">new study</h1>
          <p className="text-stone-400 text-sm mt-1">
            tell heard what you want to learn. it&rsquo;ll draft the questions.
          </p>
        </header>

        <div
          className={`grid gap-6 ${
            hasProposal ? 'lg:grid-cols-[3fr_2fr]' : 'lg:grid-cols-1'
          }`}
        >
          {/* CHAT COLUMN */}
          <div className="flex flex-col bg-stone-800/30 border border-stone-700 rounded-xl overflow-hidden h-[70vh] lg:h-[75vh]">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
            >
              <AnimatePresence initial={false}>
                {messages.map((m, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-stone-200 text-stone-900'
                          : 'bg-stone-700/60 text-stone-100'
                      }`}
                    >
                      {m.content}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {sending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-stone-700/60 rounded-2xl px-4 py-2.5">
                    <Loader2 size={14} className="animate-spin text-stone-300" />
                  </div>
                </motion.div>
              )}
            </div>

            {error && (
              <div className="border-t border-stone-700 px-6 py-2 flex items-center gap-2 text-xs text-red-300 bg-red-950/30">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}

            {/* INPUT */}
            <div className="border-t border-stone-700 px-4 py-3 bg-stone-900/40">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="type your answer..."
                  disabled={sending}
                  className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm resize-none focus:outline-none focus:border-stone-500 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="bg-stone-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-stone-900 rounded-lg p-2.5 transition-colors"
                  aria-label="send"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* PANEL COLUMN */}
          {hasProposal && proposal && (
            <div>
              <StudyDraftPanel
                initialProposal={proposal}
                originalQuestion={originalQuestion}
                creationThread={creationThread}
                onSaved={handleSaved}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionMakerChat;
