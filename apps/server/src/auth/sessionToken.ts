import crypto from 'node:crypto';
import { z } from 'zod';

const SessionPayloadSchema = z.object({
  sub: z.string().min(1).max(64),
  username: z.string().min(1).max(64),
  globalName: z.string().max(64).nullable(),
  avatarUrl: z.string().url().nullable(),
  source: z.enum(['discord', 'dev']),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type VerifiedSessionUser = z.infer<typeof SessionPayloadSchema>;

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function signHmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(
  user: Omit<VerifiedSessionUser, 'iat' | 'exp'>,
  secret: string,
  nowMs: number = Date.now(),
): string {
  const payload: VerifiedSessionUser = {
    ...user,
    iat: nowMs,
    exp: nowMs + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signHmac(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): VerifiedSessionUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = signHmac(encoded, secret);
  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsedJson: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const parsed = SessionPayloadSchema.safeParse(parsedJson);
    if (!parsed.success) return null;
    if (parsed.data.exp <= nowMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
