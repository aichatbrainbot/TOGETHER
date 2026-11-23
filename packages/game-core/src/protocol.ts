import { z } from 'zod';
import { ACTIVITY_LIMITS } from './constants.js';

export const RoomPhaseSchema = z.enum(['lobby', 'playing']);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const RoomUpdateReasonSchema = z.enum([
  'join',
  'reconnect',
  'disconnect',
  'leave',
  'ready',
  'host_migrated',
  'sync',
]);
export type RoomUpdateReason = z.infer<typeof RoomUpdateReasonSchema>;

export const ActivityPlayerSchema = z.object({
  id: z.string().min(1).max(64),
  username: z.string().min(1).max(64),
  globalName: z.string().max(64).nullable(),
  displayName: z.string().min(1).max(64),
  avatarUrl: z.string().url().nullable(),
  slot: z.number().int().min(0).max(ACTIVITY_LIMITS.MAX_PLAYERS - 1),
  color: z.string().min(4).max(16),
  badge: z.string().min(2).max(4),
  connected: z.boolean(),
  ready: z.boolean(),
  isHost: z.boolean(),
  joinedAt: z.number().int().nonnegative(),
  disconnectedAt: z.number().int().nonnegative().nullable(),
});
export type ActivityPlayer = z.infer<typeof ActivityPlayerSchema>;

export const ActivityRoomStateSchema = z.object({
  instanceId: z.string().min(1).max(ACTIVITY_LIMITS.MAX_INSTANCE_ID_LENGTH),
  channelId: z.string().max(64).nullable(),
  guildId: z.string().max(64).nullable(),
  phase: RoomPhaseSchema,
  hostId: z.string().nullable(),
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(2).max(ACTIVITY_LIMITS.MAX_PLAYERS),
  createdAt: z.number().int().nonnegative(),
  players: z.array(ActivityPlayerSchema),
});
export type ActivityRoomState = z.infer<typeof ActivityRoomStateSchema>;

export const C2SJoinInstanceSchema = z.object({
  type: z.literal('join_instance'),
  instanceId: z.string().min(1).max(ACTIVITY_LIMITS.MAX_INSTANCE_ID_LENGTH),
  channelId: z.string().max(64).nullable().optional(),
  guildId: z.string().max(64).nullable().optional(),
  sessionToken: z.string().min(16).max(2048),
});

export const C2SSetReadySchema = z.object({
  type: z.literal('set_ready'),
  ready: z.boolean(),
});

export const C2SPingSchema = z.object({
  type: z.literal('ping'),
  clientTime: z.number().finite().nonnegative(),
});

export const C2SMessageSchema = z.discriminatedUnion('type', [
  C2SJoinInstanceSchema,
  C2SSetReadySchema,
  C2SPingSchema,
]);
export type C2SMessage = z.infer<typeof C2SMessageSchema>;

export const ErrorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'UNAUTHORIZED',
  'ROOM_FULL',
  'NOT_IN_ROOM',
  'RATE_LIMITED',
  'SERVER_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const S2CWelcomeSchema = z.object({
  type: z.literal('welcome'),
  playerId: z.string().min(1),
  reconnected: z.boolean(),
  room: ActivityRoomStateSchema,
});

export const S2CRoomStateSchema = z.object({
  type: z.literal('room_state'),
  reason: RoomUpdateReasonSchema,
  room: ActivityRoomStateSchema,
});

export const S2CPongSchema = z.object({
  type: z.literal('pong'),
  clientTime: z.number().finite().nonnegative(),
  serverTime: z.number().int().nonnegative(),
});

export const S2CErrorSchema = z.object({
  type: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string().min(1).max(300),
});

export const S2CMessageSchema = z.discriminatedUnion('type', [
  S2CWelcomeSchema,
  S2CRoomStateSchema,
  S2CPongSchema,
  S2CErrorSchema,
]);
export type S2CMessage = z.infer<typeof S2CMessageSchema>;

export function parseC2SMessage(raw: unknown): C2SMessage | null {
  const result = C2SMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseS2CMessage(raw: unknown): S2CMessage | null {
  const result = S2CMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Builds an official Discord CDN avatar URL (allowed under Discord Activity CSP).
 * Falls back cleanly to Discord's default embed avatar when avatarHash is absent.
 */
export function buildDiscordAvatarUrl(
  userId: string,
  avatarHash: string | null | undefined,
  discriminator?: string | null,
): string | null {
  if (!/^\d{15,22}$/.test(userId)) {
    return null;
  }
  if (avatarHash && /^[a-zA-Z0-9_-]+$/.test(avatarHash)) {
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`;
  }
  if (discriminator && discriminator !== '0' && /^\d+$/.test(discriminator)) {
    const idx = Number(discriminator) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  try {
    const idx = Number((BigInt(userId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

export function sanitizeDisplayName(
  globalName: string | null | undefined,
  username: string,
): string {
  const chosen = (globalName && globalName.trim()) || username.trim() || 'Player';
  return chosen.slice(0, 32);
}
