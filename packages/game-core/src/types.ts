import type { ChallengeModifier } from './constants.js';

/**
 * Kinematic physics tuned using Celeste / Mario target-height formulas:
 * - Target single jump height H = 76 px, time to apex T = 0.34 s
 * - g_up = 2H / T^2 ≈ 1315 px/s^2, v0 = -2H / T ≈ -447 px/s
 * - Apex hang (0.55x gravity when |vy| < 65 & holding jump) for precise air control
 * - Snappy fall multiplier (1.45x gravity when vy > 0) eliminates sluggish floatiness
 * - 5 px upward corner correction prevents unfair head-bonks on platform edges
 * - Horizontal jump reach D ≈ 113 px -> safe gaps 72-96 px, impassable gaps >= 156 px
 */
export const PHYSICS = {
  TICK_RATE: 60,
  DT: 1 / 60,
  SNAPSHOT_INTERVAL_TICKS: 2, // 30 Hz broadcast
  PLAYER_WIDTH: 18,
  PLAYER_HEIGHT: 24,
  MOVE_SPEED: 182,
  GROUND_ACCEL: 1850,
  GROUND_FRICTION: 2050,
  AIR_ACCEL: 1280,
  AIR_FRICTION: 240,
  GRAVITY: 1315,
  APEX_GRAVITY_MULTIPLIER: 0.55,
  APEX_VELOCITY_THRESHOLD: 65,
  FALL_GRAVITY_MULTIPLIER: 1.45,
  LOW_GRAVITY_FACTOR: 0.76,
  MAX_FALL_SPEED: 660,
  JUMP_VELOCITY: -456,
  BOUNCE_VELOCITY: -610,
  JUMP_CUT_MULTIPLIER: 0.52,
  JUMP_CUT_THRESHOLD: -150,
  CORNER_CORRECTION_PX: 5,
  COYOTE_TICKS: 6, // 100 ms
  JUMP_BUFFER_TICKS: 6, // 100 ms
  RESPAWN_INVULN_TICKS: 45,
  VAULT_CHARGE_TICKS: 15,
  EXIT_HOLD_TICKS: 10,
  CRATE_PUSH_SPEED: 96,
  CRATE_FRICTION: 1250,
} as const;

export const INPUT_BITS = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  JUMP: 1 << 2,
} as const;

export type MedalTier = 'gold' | 'silver' | 'bronze';
export type LevelTier = 'normal' | 'special' | 'procedural';

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
  readonly accent: 'violet' | 'mint' | 'amber';
  readonly durationTicks?: number;
  readonly allowsCrate?: boolean;
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
  readonly phaseOffset?: number;
  readonly poweredBySwitchId?: string;
  readonly accent: 'violet' | 'mint' | 'sky';
}

export interface BouncePadDef extends Rect {
  readonly id: string;
  readonly velocityY?: number;
  readonly accent: 'mint' | 'amber';
}

export interface CrumblePlatformDef extends Rect {
  readonly id: string;
  readonly delayTicks?: number; // Default 50 (~0.83 s)
  readonly respawnTicks?: number; // Default 144 (~2.4 s)
}

export interface LaserBeamDef extends Rect {
  readonly id: string;
  readonly disabledBySwitchId: string;
  readonly alsoDisabledBySwitchId?: string;
}

export interface CheckpointDef extends Rect {
  readonly id: string;
  readonly spawnX: number;
  readonly spawnFloorY: number;
}

export interface CrateDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly requiredPushers: 1 | 2;
  readonly accent: 'amber' | 'violet';
}

export interface KeyDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly unlocksGateId: string;
  readonly accent: 'gold' | 'mint' | 'violet';
}

export interface LockedGateDef extends Rect {
  readonly id: string;
  readonly label: string;
  readonly accent: 'violet' | 'mint' | 'amber';
  readonly unlockedBySwitchId?: string;
}

export interface WireSegment {
  readonly id: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly accent: 'violet' | 'mint' | 'amber' | 'danger';
  readonly linkedTo: string;
}

export interface CueLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly accent: 'violet' | 'mint' | 'amber';
  readonly hideWhenSwitchLatched?: string;
  readonly hideWhenUnlocked?: boolean;
}

export interface LevelDefinition {
  readonly id: string;
  readonly code: string; // '1' | '2' | '3' | '4' | 'S1' | 'S2' | 'S3' | 'S4' | '∞'
  readonly tier: LevelTier;
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  readonly order: number;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly mechanicTag: string;
  readonly themeAccent: string;
  readonly parTimeMs: {
    readonly gold: number;
    readonly silver: number;
  };
  readonly width: number;
  readonly height: number;
  readonly spawnOriginX: number;
  readonly spawnFloorY: number;
  readonly solids: readonly Rect[];
  readonly oneWayPlatforms?: readonly Rect[];
  readonly hazards: readonly Rect[];
  readonly switches: readonly SwitchDef[];
  readonly bridges: readonly BridgeDef[];
  readonly movingPlatforms: readonly MovingPlatformDef[];
  readonly bouncePads?: readonly BouncePadDef[];
  readonly crumblePlatforms?: readonly CrumblePlatformDef[];
  readonly lasers?: readonly LaserBeamDef[];
  readonly checkpoints?: readonly CheckpointDef[];
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
  | 'bounce'
  | 'crumble'
  | 'checkpoint'
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

export interface CrumbleRuntimeState {
  id: string;
  state: 'solid' | 'shaking' | 'gone';
  timerTicks: number;
}

export interface LaserRuntimeState {
  id: string;
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
  activeCheckpointId: string | null;
  players: SimPlayerState[];
  switches: SwitchRuntimeState[];
  bridges: BridgeRuntimeState[];
  movingPlatforms: MovingPlatformRuntimeState[];
  crumblePlatforms: CrumbleRuntimeState[];
  lasers: LaserRuntimeState[];
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
