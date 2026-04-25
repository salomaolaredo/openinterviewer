'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Loader2, AlertCircle } from 'lucide-react';

const Login: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }

      // Redirect to studies on success (validate to prevent open redirect)
      const rawRedirect = searchParams.get('redirect') || '/studies';
      const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
        ? rawRedirect
        : '/studies';
      router.push(redirect);
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-sm w-full"
      >
        <div className="bg-stone-800/50 rounded-xl border border-stone-700 p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-stone-700 flex items-center justify-center mx-auto mb-4">
              <Lock size={24} className="text-stone-300" />
            </div>
            <h1 className="text-xl font-bold text-white">Heard</h1>
            <p className="text-stone-400 text-sm mt-1">
              Enter your password to continue
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={!password.trim() || loading}
              className="w-full py-3 bg-stone-600 hover:bg-stone-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Logging in...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
