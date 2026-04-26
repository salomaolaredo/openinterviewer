// Participant entry page. Server component: verifies the JWT token,
// then hands the validated study config to <ParticipantLanding /> for
// the branded landing + start-interview flow. Replaces the old
// consent-then-begin two-screen sequence.

import { decodeParticipantTokenString } from '@/lib/auth';
import ParticipantLanding from '@/components/ParticipantLanding';

interface PageProps {
  params: { token: string };
}

export const dynamic = 'force-dynamic';

export default async function ParticipantTokenPage({ params }: PageProps) {
  const { token } = params;
  const result = await decodeParticipantTokenString(token);

  if (!result.valid || !result.payload) {
    return <InvalidLink reason={result.error} />;
  }

  const { studyConfig } = result.payload;

  // brandName / brandLogoUrl land here in Phase 3 (researcher upload).
  // For v2 we leave them undefined; ParticipantLanding falls back to "We".
  return (
    <ParticipantLanding
      token={token}
      studyConfig={studyConfig}
      brandName={undefined}
      brandLogoUrl={undefined}
    />
  );
}

function InvalidLink({ reason }: { reason?: 'expired' | 'invalid' | 'misconfigured' }) {
  const message =
    reason === 'expired'
      ? "this link has expired. ask whoever sent it for a fresh one."
      : reason === 'misconfigured'
      ? "something's off on our end. try again in a moment."
      : "this link isn't valid. check with whoever sent it.";

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-stone-300 text-lg leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
