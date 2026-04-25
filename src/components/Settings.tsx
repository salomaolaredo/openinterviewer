'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, Key, CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ConfigStatus {
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
}

const Settings: React.FC = () => {
  const router = useRouter();
  const [status, setStatus] = useState<ConfigStatus | null>(null);

  useEffect(() => {
    fetch('/api/config/status')
      .then((r) => r.json())
      .then((d: ConfigStatus) => setStatus(d))
      .catch(() => setStatus({ hasAnthropicKey: false, hasGeminiKey: false }));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.push('/studies')}
          className="flex items-center gap-2 text-stone-400 hover:text-stone-200 text-sm mb-8"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-stone-400 text-sm mb-8">
          Heard runs in standalone mode. All configuration is in <code className="text-stone-300">.env.local</code>.
        </p>

        <section className="bg-stone-800/50 rounded-xl border border-stone-700 p-6 mb-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={18} /> AI Provider Keys
          </h2>
          <div className="space-y-3 text-sm">
            <Row label="Anthropic (Claude)" ok={status?.hasAnthropicKey ?? false} />
            <Row label="Gemini (Google)" ok={status?.hasGeminiKey ?? false} />
          </div>
          <p className="text-stone-500 text-xs mt-4">
            Set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> then restart the dev server.
          </p>
        </section>

        <section className="bg-stone-800/50 rounded-xl border border-stone-700 p-6 mb-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Database size={18} /> Database
          </h2>
          <p className="text-sm text-stone-400">
            PostgreSQL via <code>DATABASE_URL</code>. Schema managed by <code>drizzle-kit push</code>.
          </p>
        </section>

        <button
          onClick={handleLogout}
          className="text-sm text-stone-400 hover:text-stone-200"
        >
          Log out
        </button>
      </div>
    </div>
  );
};

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle size={16} className="text-green-400" /> : <XCircle size={16} className="text-stone-500" />}
      <span className={ok ? 'text-stone-200' : 'text-stone-500'}>{label}</span>
    </div>
  );
}

export default Settings;
