import type { ChallengeModifier } from './constants.js';

export const PHYSICS = {
  TICK_RATE: 60,
  DT: 1 / 60,
  SNAPSHOT_INTERVAL_TICKS: 2, // 30 Hz broadcast
  PLAYER_WIDTH: 18,
  PLAYER_HEIGHT: 24,
  MOVE_SPEED: 176,
  GROUND_ACCEL: 1700,
  GROUND_FRICTION: 1900,
  AIR_ACCEL: 1150,
  AIR_FRICTION: 260,
  GRAVITY: 1280,
  LOW_GRAVITY_FACTOR: 0.76,
  MAX_FALL_SPEED: 620,
  JUMP_VELOCITY: -452,
  JUMP_CUT_MULTIPLIER: 0.55,
  JUMP_CUT_THRESHOLD: -150,
  COYOTE_TICKS: 6,
  JUMP_BUFFER_TICKS: 6,
  RESPAWN_INVULN_TICKS: 45,
  VAULT_CHARGE_TICKS: 15,
  EXIT_HOLD_TICKS: 10,
  CRATE_PUSH_SPEED: 92,
  CRATE_FRICTION: 1200,
} as const;

export const INPUT_BITS = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  JUMP: 1 << 2,
} as const;

export type MedalTier = 'gold' | 'silver' | 'bronze';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SwitchDef extends Rect {
  readonly id: string;
  readonly label: string;
  readonly kind: 'hold' | 'latch' | 'vault' | 'timed';
  readonly accent: 'violet' | 'mint';
  readonly durationTicks?: number; // For 'timed' switches
  readonly allowsCrate?: boolean; // Defaults to true for hold/latch/vault
}

export interface BridgeDef extends Rect {
  readonly id: string;
  readonly poweredBySwitchId: string;
  readonly latchedBySwitchId?: string;
  readonly timedBySwitchId?: string;
}

export interface MovingPlatformDef {
  readonly id: string;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly w: number;
  readonly h: number;
  readonly cycleSeconds: number;
  readonly phaseOffset?: number; // 0..1
  readonly poweredBySwitchId?: string; // Optional: only moves when switch is active/latched
  readonly accent: 'violet' | 'mint';
}

export interface CrateDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly requiredPushers: 1 | 2;
  readonly accent: 'violet' | 'mint';
}

export interface KeyDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly unlocksGateId: string;
  readonly accent: 'violet' | 'mint';
}

export interface LockedGateDef extends Rect {
  readonly id: string;
  readonly label: string;
  readonly accent: 'violet' | 'mint';
  readonly unlockedBySwitchId?: string; // Optional switch-controlled barrier
}

export interface WireSegment {
  readonly id: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly accent: 'violet' | 'mint';
  readonly linkedTo: string; // switch id or 'exit'
}

export interface CueLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly accent: 'violet' | 'mint';
  readonly hideWhenSwitchLatched?: string;
  readonly hideWhenUnlocked?: boolean;
}

export interface LevelDefinition {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly mechanicTag: string;
  readonly parTimeMs: {
    readonly gold: number;
    readonly silver: number;
  };
  readonly width: number;
  readonly height: number;
  readonly spawnOriginX: number;
  readonly spawnFloorY: number;
  readonly solids: readonly Rect[];
  readonly hazards: readonly Rect[];
  readonly switches: readonly SwitchDef[];
  readonly bridges: readonly BridgeDef[];
  readonly movingPlatforms: readonly MovingPlatformDef[];
  readonly crates: readonly CrateDef[];
  readonly keys: readonly KeyDef[];
  readonly lockedGates: readonly LockedGateDef[];
  readonly exitDoor: Rect;
  readonly requiresVaultSwitches: boolean;
  readonly wires: readonly WireSegment[];
  readonly cues: readonly CueLabel[];
  readonly proceduralSeed?: number;
}

export type SimEventType =
  | 'jump'
  | 'land'
  | 'switch_on'
  | 'bridge_on'
  | 'bridge_lock'
  | 'key_pickup'
  | 'gate_unlock'
  | 'door_unlock'
  | 'respawn'
  | 'level_complete';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  color?: string;
  playerId?: string;
}

export interface SimPlayerState {
  id: string;
  displayName: string;
  slot: number;
  color: string;
  badge: string;
  isSoloPuppet: boolean;
  connected: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  standingOnId: string | null;
  standingOnPlatformId: string | null;
  standingOnCrateId: string | null;
  coyoteTicks: number;
  jumpBufferTicks: number;
  prevJumpDown: boolean;
  invulnTicks: number;
  atExit: boolean;
  lastProcessedSeq: number;
}

export interface SwitchRuntimeState {
  id: string;
  pressed: boolean;
  latched: boolean;
  remainingTicks: number;
  maxTicks: number;
}

export interface BridgeRuntimeState {
  id: string;
  active: boolean;
  locked: boolean;
  remainingTicks: number;
  maxTicks: number;
}

export interface MovingPlatformRuntimeState {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
  progress: number;
  active: boolean;
}

export interface CrateRuntimeState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  requiredPushers: 1 | 2;
  activePushers: number;
  grounded: boolean;
  standingOnPlatformId: string | null;
}

export interface KeyRuntimeState {
  id: string;
  x: number;
  y: number;
  carrierPlayerId: string | null;
  used: boolean;
}

export interface LockedGateRuntimeState {
  id: string;
  unlocked: boolean;
}

export interface ExitDoorRuntimeState {
  unlocked: boolean;
  chargeTicks: number;
  chargeRequired: number;
  playersInside: number;
  playersRequired: number;
  exitHoldTicks: number;
}

export interface PlayerContribution {
  switchesTriggered: number;
  keysCollected: number;
  respawns: number;
}

export interface GameWorldState {
  levelId: string;
  proceduralSeed: number | null;
  modifier: ChallengeModifier;
  tick: number;
  elapsedMs: number;
  soloPractice: boolean;
  soloActiveId: string | null;
  status: 'playing' | 'completed';
  completionTimeMs: number | null;
  medal: MedalTier | null;
  respawnCount: number;
  players: SimPlayerState[];
  switches: SwitchRuntimeState[];
  bridges: BridgeRuntimeState[];
  movingPlatforms: MovingPlatformRuntimeState[];
  crates: CrateRuntimeState[];
  keys: KeyRuntimeState[];
  lockedGates: LockedGateRuntimeState[];
  exitDoor: ExitDoorRuntimeState;
  contributions: Record<string, PlayerContribution>;
}

export interface LeaderboardEntry {
  id: string;
  levelId: string;
  levelName: string;
  modifier: ChallengeModifier;
  completionTimeMs: number;
  respawnCount: number;
  medal: MedalTier;
  playerCount: number;
  playerNames: string[];
  soloPractice: boolean;
  recordedAt: number;
}

export interface PlayerProfileStats {
  userId: string;
  displayName: string;
  chambersCleared: number;
  bestTimesByLevel: Record<string, number>;
  medals: {
    gold: number;
    silver: number;
    bronze: number;
  };
  switchesTriggered: number;
  keysCollected: number;
  totalRespawns: number;
  lastPlayedAt: number;
}
