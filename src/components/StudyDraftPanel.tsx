'use client';

/**
 * StudyDraftPanel
 *
 * Editable preview of a study proposed by the Question Maker. The researcher
 * can tweak the questions, audience, north star, and study name inline, then
 * hit "Save & Get Link" to persist.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Trash2,
  Loader2,
  Check,
  Copy,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';

interface ProposalShape {
  questions: string[];
  audience: string;
  northStar: string;
  studyName: string;
}

interface ThreadEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface StudyDraftPanelProps {
  initialProposal: ProposalShape;
  originalQuestion: string;
  creationThread: ThreadEntry[];
  onSaved?: (studyId: string, shareLink: string) => void;
}

const StudyDraftPanel: React.FC<StudyDraftPanelProps> = ({
  initialProposal,
  originalQuestion,
  creationThread,
  onSaved,
}) => {
  const [studyName, setStudyName] = useState(initialProposal.studyName);
  const [audience, setAudience] = useState(initialProposal.audience);
  const [northStar, setNorthStar] = useState(initialProposal.northStar);
  const [questions, setQuestions] = useState<string[]>(initialProposal.questions);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedShareLink, setSavedShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const updateQuestion = (idx: number, value: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? value : q)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, '']);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError(null);
    const cleanedQuestions = questions.map((q) => q.trim()).filter(Boolean);
    if (cleanedQuestions.length === 0) {
      setError('add at least one question before saving.');
      return;
    }
    if (!studyName.trim()) {
      setError('give the study a name.');
      return;
    }
    if (!audience.trim()) {
      setError('describe the audience.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/studies/from-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalQuestion,
          creationThread,
          finalQuestions: cleanedQuestions,
          studyName: studyName.trim(),
          audience: audience.trim(),
          northStar: northStar.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'failed to save study.');
        return;
      }
      const shareLink: string = data.shareLink || '';
      setSavedShareLink(shareLink);
      if (onSaved && data.studyId) onSaved(data.studyId, shareLink);
    } catch {
      setError('connection error. try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!savedShareLink) return;
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${savedShareLink}`
        : savedShareLink;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // ---- Saved state ----
  if (savedShareLink) {
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${savedShareLink}`
        : savedShareLink;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-stone-800/40 border border-stone-700 rounded-xl p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center">
            <Check size={16} className="text-stone-200" />
          </div>
          <h3 className="text-stone-100 font-medium">study saved</h3>
        </div>
        <p className="text-stone-400 text-sm mb-4">
          send this link to participants. one link works for everyone.
        </p>
        <div className="flex items-center gap-2 bg-stone-900 border border-stone-700 rounded-lg p-3">
          <LinkIcon size={14} className="text-stone-500 shrink-0" />
          <code className="text-stone-300 text-xs truncate flex-1">{fullUrl}</code>
          <button
            onClick={handleCopy}
            className="text-stone-400 hover:text-stone-200 transition-colors shrink-0"
            aria-label="copy link"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </motion.div>
    );
  }

  // ---- Edit state ----
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-stone-800/40 border border-stone-700 rounded-xl p-6 space-y-5"
    >
      <div>
        <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1.5">
          study name
        </label>
        <input
          type="text"
          value={studyName}
          onChange={(e) => setStudyName(e.target.value)}
          className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-stone-500"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1.5">
          audience
        </label>
        <textarea
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          rows={2}
          className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm resize-none focus:outline-none focus:border-stone-500"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1.5">
          north star
        </label>
        <p className="text-stone-500 text-xs mb-1.5">
          what answer would change your next move?
        </p>
        <textarea
          value={northStar}
          onChange={(e) => setNorthStar(e.target.value)}
          rows={2}
          className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm resize-none focus:outline-none focus:border-stone-500"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1.5">
          questions
        </label>
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <div className="text-stone-500 text-xs pt-2 w-5 shrink-0 text-right">
                {idx + 1}.
              </div>
              <textarea
                value={q}
                onChange={(e) => updateQuestion(idx, e.target.value)}
                rows={2}
                className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm resize-none focus:outline-none focus:border-stone-500"
              />
              <button
                onClick={() => removeQuestion(idx)}
                className="text-stone-500 hover:text-stone-300 transition-colors p-2"
                aria-label="remove question"
                disabled={questions.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addQuestion}
          className="mt-2 inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-200 text-sm transition-colors"
        >
          <Plus size={14} />
          add question
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-stone-200 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-stone-900 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            saving
          </>
        ) : (
          'save & get link'
        )}
      </button>
    </motion.div>
  );
};

export default StudyDraftPanel;
