// Session token utilities for researcher authentication (standalone only).
// Password-based admin login; participant tokens via JWT.

import * as jose from 'jose';

const SESSION_COOKIE_NAME = 'research-auth';
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days in seconds

// Get the signing secret from environment
// Uses SESSION_SECRET if available, falls back to ADMIN_PASSWORD
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error('SESSION_SECRET or ADMIN_PASSWORD environment variable is required');
  }

  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.warn(
      '[Security] SESSION_SECRET not set - falling back to ADMIN_PASSWORD. ' +
        'For better security, set a dedicated SESSION_SECRET environment variable.'
    );
  }

  return new TextEncoder().encode(secret);
}

// Create a signed session token.
export async function createSessionToken(): Promise<string> {
  const secret = getSecret();

  const payload: Record<string, unknown> = { type: 'session' };

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(secret);

  return token;
}

// Session verification result
export interface SessionVerifyResult {
  valid: boolean;
}

// Verify a session token.
export async function verifySessionToken(token: string): Promise<SessionVerifyResult> {
  if (!token) {
    return { valid: false };
  }

  try {
    const secret = getSecret();
    const { payload } = await jose.jwtVerify(token, secret);

    if (payload.type !== 'session') {
      return { valid: false };
    }

    return { valid: true };
  } catch {
    return { valid: false };
  }
}

// Cookie configuration for session token
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: SESSION_DURATION,
    path: '/',
  };
}

export { SESSION_COOKIE_NAME };

// === Participant Token Verification ===

function getParticipantSecret(): Uint8Array | null {
  const secret = process.env.PARTICIPANT_TOKEN_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) return null;

  if (!process.env.PARTICIPANT_TOKEN_SECRET && process.env.NODE_ENV === 'production') {
    console.warn(
      '[Security] PARTICIPANT_TOKEN_SECRET not set - falling back to ADMIN_PASSWORD. ' +
        'For better security, set a dedicated PARTICIPANT_TOKEN_SECRET environment variable.'
    );
  }

  return new TextEncoder().encode(secret);
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=');
    if (key === name) {
      return valueParts.join('=');
    }
  }
  return null;
}

async function hasValidAdminSession(request: Request): Promise<boolean> {
  const sessionToken = getCookieValue(request, SESSION_COOKIE_NAME);
  if (!sessionToken) return false;
  const result = await verifySessionToken(sessionToken);
  return result.valid;
}

// Participant token verification result
export interface ParticipantVerifyResult {
  valid: boolean;
  studyId?: string;
  isAdmin?: boolean;
  error?: string;
}

// Verify participant token from Authorization header.
// Also accepts valid admin session cookies (for researcher preview).
export async function verifyParticipantToken(request: Request): Promise<ParticipantVerifyResult> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const secret = getParticipantSecret();
    if (secret) {
      try {
        const { payload } = await jose.jwtVerify(token, secret);

        if (payload.type === 'session') {
          // Fall through to admin session check
        } else {
          const studyId = payload.studyId as string;
          return { valid: true, studyId };
        }
      } catch (error) {
        if (error instanceof jose.errors.JWTExpired) {
          return {
            valid: false,
            error:
              'This link has expired. Please request a new participant link from the researcher.',
          };
        }
      }
    }
  }

  const isAdmin = await hasValidAdminSession(request);
  if (isAdmin) {
    return { valid: true, isAdmin: true };
  }

  return { valid: false };
}

// Decode and verify a raw participant token string (no Request wrapper).
// Used by server components that receive the token via path params.
// Returns the full decoded payload on success, or an error reason on failure.
export interface DecodedParticipantToken {
  valid: boolean;
  payload?: import('jose').JWTPayload & {
    studyId: string;
    studyConfig: import('@/types').StudyConfig;
    createdAt: number;
    expiresAt?: number;
  };
  error?: 'expired' | 'invalid' | 'misconfigured';
}

export async function decodeParticipantTokenString(
  token: string
): Promise<DecodedParticipantToken> {
  if (!token) return { valid: false, error: 'invalid' };

  const secret = getParticipantSecret();
  if (!secret) return { valid: false, error: 'misconfigured' };

  try {
    const { payload } = await jose.jwtVerify(token, secret);
    if (!payload || typeof payload !== 'object' || !('studyConfig' in payload)) {
      return { valid: false, error: 'invalid' };
    }
    return {
      valid: true,
      payload: payload as DecodedParticipantToken['payload'],
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return { valid: false, error: 'expired' };
    }
    return { valid: false, error: 'invalid' };
  }
}
