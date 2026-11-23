import { z } from 'zod';
import { ACTIVITY_LIMITS } from './constants.js';

export const RoomPhaseSchema = z.enum(['lobby', 'playing']);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const ChallengeModifierSchema = z.enum(['standard', 'low_gravity', 'speed_run']);
export const EmotePingIdSchema = z.enum(['stack', 'wait', 'go', 'nice']);
export const MedalTierSchema = z.enum(['gold', 'silver', 'bronze']);

export const RoomUpdateReasonSchema = z.enum([
  'join',
  'reconnect',
  'disconnect',
  'leave',
  'ready',
  'host_migrated',
  'level_selected',
  'game_started',
  'game_restarted',
  'returned_lobby',
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

export const SessionClearSummarySchema = z.object({
  levelId: z.string(),
  levelName: z.string(),
  modifier: ChallengeModifierSchema,
  completionTimeMs: z.number().int().nonnegative(),
  respawnCount: z.number().int().nonnegative(),
  medal: MedalTierSchema,
  clearedAt: z.number().int().nonnegative(),
});
export type SessionClearSummary = z.infer<typeof SessionClearSummarySchema>;

export const ActivityRoomStateSchema = z.object({
  instanceId: z.string().min(1).max(ACTIVITY_LIMITS.MAX_INSTANCE_ID_LENGTH),
  channelId: z.string().max(64).nullable(),
  guildId: z.string().max(64).nullable(),
  phase: RoomPhaseSchema,
  hostId: z.string().nullable(),
  selectedLevelId: z.string().min(1).max(64),
  selectedSeed: z.number().int().min(100_000).max(999_999).nullable(),
  modifier: ChallengeModifierSchema,
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(2).max(ACTIVITY_LIMITS.MAX_PLAYERS),
  createdAt: z.number().int().nonnegative(),
  players: z.array(ActivityPlayerSchema),
  sessionClears: z.array(SessionClearSummarySchema),
});
export type ActivityRoomState = z.infer<typeof ActivityRoomStateSchema>;

export const SimEventSchema = z.object({
  type: z.enum([
    'jump',
    'land',
    'bounce',
    'crumble',
    'checkpoint',
    'coin_pickup',
    'switch_on',
    'bridge_on',
    'bridge_lock',
    'key_pickup',
    'gate_unlock',
    'door_unlock',
    'respawn',
    'level_complete',
  ]),
  x: z.number(),
  y: z.number(),
  color: z.string().optional(),
  playerId: z.string().optional(),
});

export const SimPlayerStateSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  slot: z.number().int(),
  color: z.string(),
  badge: z.string(),
  isSoloPuppet: z.boolean(),
  connected: z.boolean(),
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  facing: z.union([z.literal(1), z.literal(-1)]),
  grounded: z.boolean(),
  standingOnId: z.string().nullable(),
  standingOnPlatformId: z.string().nullable(),
  standingOnCrateId: z.string().nullable(),
  coyoteTicks: z.number().int(),
  jumpBufferTicks: z.number().int(),
  dropThroughTicks: z.number().int().optional(),
  prevJumpDown: z.boolean(),
  invulnTicks: z.number().int(),
  atExit: z.boolean(),
  lastProcessedSeq: z.number().int(),
});

export const GameWorldStateSchema = z.object({
  levelId: z.string(),
  proceduralSeed: z.number().int().nullable(),
  modifier: ChallengeModifierSchema,
  tick: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  soloPractice: z.boolean(),
  soloActiveId: z.string().nullable(),
  soloFollow: z.boolean().optional(),
  status: z.enum(['playing', 'completed']),
  completionTimeMs: z.number().int().nullable(),
  medal: MedalTierSchema.nullable(),
  respawnCount: z.number().int().nonnegative(),
  activeCheckpointId: z.string().nullable(),
  players: z.array(SimPlayerStateSchema),
  switches: z.array(
    z.object({
      id: z.string(),
      pressed: z.boolean(),
      latched: z.boolean(),
      remainingTicks: z.number().int().nonnegative(),
      maxTicks: z.number().int().nonnegative(),
      pressers: z.number().int().nonnegative().optional(),
      requiredPressers: z.number().int().positive().optional(),
    }),
  ),
  bridges: z.array(
    z.object({
      id: z.string(),
      active: z.boolean(),
      locked: z.boolean(),
      remainingTicks: z.number().int().nonnegative(),
      maxTicks: z.number().int().nonnegative(),
    }),
  ),
  movingPlatforms: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
      dx: z.number(),
      dy: z.number(),
      w: z.number(),
      h: z.number(),
      progress: z.number(),
      active: z.boolean(),
    }),
  ),
  crumblePlatforms: z.array(
    z.object({
      id: z.string(),
      state: z.enum(['solid', 'shaking', 'gone']),
      timerTicks: z.number().int().nonnegative(),
    }),
  ),
  lasers: z.array(
    z.object({
      id: z.string(),
      active: z.boolean(),
    }),
  ),
  crates: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
      vx: z.number(),
      vy: z.number(),
      w: z.number(),
      h: z.number(),
      requiredPushers: z.union([z.literal(1), z.literal(2)]),
      activePushers: z.number().int().nonnegative(),
      grounded: z.boolean(),
      standingOnPlatformId: z.string().nullable(),
    }),
  ),
  keys: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
      carrierPlayerId: z.string().nullable(),
      used: z.boolean(),
    }),
  ),
  coins: z
    .array(
      z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        collected: z.boolean(),
      }),
    )
    .optional(),
  lockedGates: z.array(
    z.object({
      id: z.string(),
      unlocked: z.boolean(),
    }),
  ),
  exitDoor: z.object({
    unlocked: z.boolean(),
    chargeTicks: z.number().int().nonnegative(),
    chargeRequired: z.number().int().positive(),
    playersInside: z.number().int().nonnegative(),
    playersRequired: z.number().int().positive(),
    exitHoldTicks: z.number().int().nonnegative(),
  }),
  contributions: z.record(
    z.string(),
    z.object({
      switchesTriggered: z.number().int().nonnegative(),
      keysCollected: z.number().int().nonnegative(),
      respawns: z.number().int().nonnegative(),
    }),
  ),
});

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

export const C2SSelectLevelSchema = z.object({
  type: z.literal('select_level'),
  levelId: z.string().min(1).max(64),
  proceduralSeed: z.number().int().min(100_000).max(999_999).nullable().optional(),
  modifier: ChallengeModifierSchema.optional(),
});

export const C2SStartGameSchema = z.object({
  type: z.literal('start_game'),
  levelId: z.string().min(1).max(64).optional(),
  proceduralSeed: z.number().int().min(100_000).max(999_999).nullable().optional(),
  modifier: ChallengeModifierSchema.optional(),
});

export const C2SInputSchema = z.object({
  type: z.literal('input'),
  seq: z.number().int().nonnegative().max(1_000_000_000),
  buttons: z.number().int().min(0).max(15),
});

export const C2SSwapSoloPuppetSchema = z.object({
  type: z.literal('swap_solo_puppet'),
});

export const C2SToggleSoloFollowSchema = z.object({
  type: z.literal('toggle_solo_follow'),
});

export const C2SRespawnSelfSchema = z.object({
  type: z.literal('respawn_self'),
});

export const C2SSendEmoteSchema = z.object({
  type: z.literal('send_emote'),
  emote: EmotePingIdSchema,
});

export const C2SRestartLevelSchema = z.object({
  type: z.literal('restart_level'),
});

export const C2SReturnLobbySchema = z.object({
  type: z.literal('return_lobby'),
});

export const C2SPingSchema = z.object({
  type: z.literal('ping'),
  clientTime: z.number().finite().nonnegative(),
});

export const C2SMessageSchema = z.discriminatedUnion('type', [
  C2SJoinInstanceSchema,
  C2SSetReadySchema,
  C2SSelectLevelSchema,
  C2SStartGameSchema,
  C2SInputSchema,
  C2SSwapSoloPuppetSchema,
  C2SToggleSoloFollowSchema,
  C2SRespawnSelfSchema,
  C2SSendEmoteSchema,
  C2SRestartLevelSchema,
  C2SReturnLobbySchema,
  C2SPingSchema,
]);
export type C2SMessage = z.infer<typeof C2SMessageSchema>;

export const ErrorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'UNAUTHORIZED',
  'ROOM_FULL',
  'NOT_IN_ROOM',
  'NOT_HOST',
  'RATE_LIMITED',
  'SERVER_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const S2CWelcomeSchema = z.object({
  type: z.literal('welcome'),
  playerId: z.string().min(1),
  reconnected: z.boolean(),
  room: ActivityRoomStateSchema,
  world: GameWorldStateSchema.nullable().optional(),
});

export const S2CRoomStateSchema = z.object({
  type: z.literal('room_state'),
  reason: RoomUpdateReasonSchema,
  room: ActivityRoomStateSchema,
});

export const S2CGameSnapshotSchema = z.object({
  type: z.literal('game_snapshot'),
  serverTime: z.number().int().nonnegative(),
  world: GameWorldStateSchema,
  events: z.array(SimEventSchema),
});

export const S2CEmoteBroadcastSchema = z.object({
  type: z.literal('player_emote'),
  playerId: z.string().min(1),
  emote: EmotePingIdSchema,
  serverTime: z.number().int().nonnegative(),
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
  S2CGameSnapshotSchema,
  S2CEmoteBroadcastSchema,
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
