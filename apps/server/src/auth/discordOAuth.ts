import { buildDiscordAvatarUrl, sanitizeDisplayName } from '@together/game-core';
import { z } from 'zod';

const DiscordTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

const DiscordUserResponseSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  discriminator: z.string().optional(),
});

export interface DiscordOAuthResult {
  accessToken: string;
  user: {
    id: string;
    username: string;
    globalName: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
}

export class DiscordOAuthError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'DiscordOAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type FetchLike = typeof fetch;

export async function exchangeDiscordAuthorizationCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: FetchLike;
}): Promise<DiscordOAuthResult> {
  const { code, clientId, clientSecret, fetchFn = fetch } = params;

  if (!clientId || !clientSecret) {
    throw new DiscordOAuthError(
      'Server is missing Discord OAuth2 credentials (VITE_DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET).',
      503,
      'DISCORD_NOT_CONFIGURED',
    );
  }

  // Official Discord Embedded App SDK token exchange uses form-urlencoded without redirect_uri.
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
  });

  const tokenRes = await fetchFn('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody,
  });

  if (!tokenRes.ok) {
    let discordErrorDetail = '';
    try {
      const errBody = (await tokenRes.json()) as { error?: string; error_description?: string };
      if (errBody.error) {
        discordErrorDetail = ` (${errBody.error}${errBody.error_description ? `: ${errBody.error_description}` : ''})`;
      }
    } catch {
      // ignore non-JSON body
    }
    throw new DiscordOAuthError(
      `Discord token exchange rejected with HTTP ${tokenRes.status}${discordErrorDetail}.`,
      401,
      'TOKEN_EXCHANGE_FAILED',
    );
  }

  const tokenJson: unknown = await tokenRes.json();
  const tokenParsed = DiscordTokenResponseSchema.safeParse(tokenJson);
  if (!tokenParsed.success) {
    throw new DiscordOAuthError(
      'Unexpected response format from Discord OAuth2 token endpoint.',
      502,
      'INVALID_TOKEN_RESPONSE',
    );
  }

  const accessToken = tokenParsed.data.access_token;

  // Verify the user's real Discord identity server-side.
  const userRes = await fetchFn('https://discord.com/api/users/@me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userRes.ok) {
    throw new DiscordOAuthError(
      `Failed to verify Discord user identity (HTTP ${userRes.status}).`,
      401,
      'USER_FETCH_FAILED',
    );
  }

  const userJson: unknown = await userRes.json();
  const userParsed = DiscordUserResponseSchema.safeParse(userJson);
  if (!userParsed.success) {
    throw new DiscordOAuthError(
      'Unexpected user payload returned by Discord API.',
      502,
      'INVALID_USER_RESPONSE',
    );
  }

  const dUser = userParsed.data;
  const globalName = dUser.global_name ?? null;
  const displayName = sanitizeDisplayName(globalName, dUser.username);
  const avatarUrl = buildDiscordAvatarUrl(dUser.id, dUser.avatar ?? null, dUser.discriminator);

  return {
    accessToken,
    user: {
      id: dUser.id,
      username: dUser.username,
      globalName,
      displayName,
      avatarUrl,
    },
  };
}
