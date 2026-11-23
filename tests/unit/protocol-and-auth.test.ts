import {
  buildDiscordAvatarUrl,
  getPaletteForSlot,
  parseC2SMessage,
  parseS2CMessage,
  sanitizeDisplayName,
} from '@together/game-core';
import { describe, expect, it } from 'vitest';
import { DiscordOAuthError, exchangeDiscordAuthorizationCode } from '../../apps/server/src/auth/discordOAuth.js';
import { createSessionToken, verifySessionToken } from '../../apps/server/src/auth/sessionToken.js';

describe('@together/game-core protocol & helpers', () => {
  it('validates valid C2S messages and rejects invalid payloads', () => {
    const valid = parseC2SMessage({
      type: 'join_instance',
      instanceId: 'inst_abc_123',
      channelId: '123456789',
      guildId: '987654321',
      sessionToken: 'a'.repeat(32),
    });
    expect(valid).not.toBeNull();
    expect(valid?.type).toBe('join_instance');

    expect(parseC2SMessage({ type: 'join_instance', instanceId: '', sessionToken: 'short' })).toBeNull();
    expect(parseC2SMessage({ type: 'cheat_position', x: 999, y: 0 })).toBeNull();
    expect(parseC2SMessage(null)).toBeNull();
  });

  it('validates S2C error and pong messages', () => {
    expect(parseS2CMessage({ type: 'pong', clientTime: 100, serverTime: 200 })).not.toBeNull();
    expect(parseS2CMessage({ type: 'error', code: 'ROOM_FULL', message: 'Full' })).not.toBeNull();
    expect(parseS2CMessage({ type: 'error', code: 'UNKNOWN_CODE', message: 'Bad' })).toBeNull();
  });

  it('builds safe Discord CDN avatar URLs and handles fallbacks', () => {
    expect(buildDiscordAvatarUrl('123456789012345678', 'a_abcdef1234')).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/a_abcdef1234.gif?size=128',
    );
    expect(buildDiscordAvatarUrl('123456789012345678', 'deadbeef01')).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/deadbeef01.png?size=128',
    );
    expect(buildDiscordAvatarUrl('123456789012345678', null)).toMatch(
      /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/,
    );
    expect(buildDiscordAvatarUrl('dev_local_123', null)).toBeNull();
  });

  it('assigns distinct palette badges P1..P8 and sanitizes display names', () => {
    expect(getPaletteForSlot(0).badge).toBe('P1');
    expect(getPaletteForSlot(7).badge).toBe('P8');
    expect(sanitizeDisplayName('  Alex  ', 'alex_dev')).toBe('Alex');
    expect(sanitizeDisplayName(null, 'alex_dev')).toBe('alex_dev');
  });
});

describe('HMAC session tokens', () => {
  const secret = 'test-secret-key-for-unit-tests-only';

  it('signs and verifies valid session tokens', () => {
    const token = createSessionToken(
      {
        sub: '123456789012345678',
        username: 'nova',
        globalName: 'Nova',
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
        source: 'discord',
      },
      secret,
      10_000,
    );

    const verified = verifySessionToken(token, secret, 20_000);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe('123456789012345678');
    expect(verified?.source).toBe('discord');
  });

  it('rejects tampered, wrong-secret, and expired tokens', () => {
    const token = createSessionToken(
      {
        sub: '123456789012345678',
        username: 'nova',
        globalName: null,
        avatarUrl: null,
        source: 'discord',
      },
      secret,
      1_000,
    );

    expect(verifySessionToken(token, 'wrong-secret', 2_000)).toBeNull();
    expect(verifySessionToken(`${token}tampered`, secret, 2_000)).toBeNull();
    expect(verifySessionToken(token, secret, 1_000 + 3 * 60 * 60 * 1000)).toBeNull();
  });
});

describe('Discord OAuth2 code exchange', () => {
  it('exchanges authorization code using form-urlencoded and verifies /users/@me', async () => {
    const calls: Array<{ url: string; method?: string; body?: string; contentType?: string }> = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? String(init.body) : undefined,
        contentType: headers.get('content-type') ?? undefined,
      });

      if (url === 'https://discord.com/api/oauth2/token') {
        return new Response(JSON.stringify({ access_token: 'discord_access_xyz', token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://discord.com/api/users/@me') {
        return new Response(
          JSON.stringify({
            id: '222222222222222222',
            username: 'pixel_hero',
            global_name: 'Pixel Hero',
            avatar: 'hash98765',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('not found', { status: 404 });
    };

    const result = await exchangeDiscordAuthorizationCode({
      code: 'oauth_code_123',
      clientId: '111111111111111111',
      clientSecret: 'super_secret_value',
      fetchFn: mockFetch,
    });

    expect(result.accessToken).toBe('discord_access_xyz');
    expect(result.user.id).toBe('222222222222222222');
    expect(result.user.displayName).toBe('Pixel Hero');
    expect(result.user.avatarUrl).toContain('cdn.discordapp.com/avatars/222222222222222222/hash98765.png');

    expect(calls[0]?.url).toBe('https://discord.com/api/oauth2/token');
    expect(calls[0]?.contentType).toBe('application/x-www-form-urlencoded');
    expect(calls[0]?.body).toContain('grant_type=authorization_code');
    expect(calls[0]?.body).toContain('code=oauth_code_123');
    expect(calls[0]?.body).not.toContain('redirect_uri');
  });

  it('throws structured DiscordOAuthError when credentials are missing or code fails', async () => {
    await expect(
      exchangeDiscordAuthorizationCode({
        code: 'abc',
        clientId: '',
        clientSecret: '',
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'DISCORD_NOT_CONFIGURED',
    } satisfies Partial<DiscordOAuthError>);

    const failingFetch: typeof fetch = async () => new Response('unauthorized', { status: 400 });
    await expect(
      exchangeDiscordAuthorizationCode({
        code: 'bad_code',
        clientId: '111',
        clientSecret: 'secret',
        fetchFn: failingFetch,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'TOKEN_EXCHANGE_FAILED',
    } satisfies Partial<DiscordOAuthError>);
  });
});
