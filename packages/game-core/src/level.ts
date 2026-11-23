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
  MAX_FALL_SPEED: 620,
  JUMP_VELOCITY: -452,
  JUMP_CUT_MULTIPLIER: 0.55,
  JUMP_CUT_THRESHOLD: -150,
  COYOTE_TICKS: 6, // 100 ms
  JUMP_BUFFER_TICKS: 6, // 100 ms
  RESPAWN_INVULN_TICKS: 45, // 750 ms
  VAULT_CHARGE_TICKS: 15, // 250 ms simultaneous hold
  EXIT_HOLD_TICKS: 10, // ~166 ms all players inside exit
} as const;

export const INPUT_BITS = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  JUMP: 1 << 2,
} as const;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SwitchDef extends Rect {
  readonly id: string;
  readonly label: string;
  readonly kind: 'hold' | 'latch' | 'vault';
  readonly accent: 'violet' | 'mint';
}

export interface BridgeDef extends Rect {
  readonly id: string;
  readonly poweredBySwitchId: string;
  readonly latchedBySwitchId: string;
}

export interface WireSegment {
  readonly id: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly accent: 'violet' | 'mint';
  readonly linkedTo: 'bridge_hold' | 'bridge_lock' | 'vault_left' | 'vault_right' | 'exit';
}

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly width: number;
  readonly height: number;
  readonly spawnOriginX: number;
  readonly spawnFloorY: number;
  readonly solids: readonly Rect[];
  readonly hazards: readonly Rect[];
  readonly switches: readonly SwitchDef[];
  readonly bridges: readonly BridgeDef[];
  readonly exitDoor: Rect;
  readonly wires: readonly WireSegment[];
}

/**
 * Original Phase 2 cooperative level — Chamber 01: Synchrony (800 x 448).
 *
 * Math verification:
 * - Single jump peak from floor (y=384): 445^2 / (2 * 1280) = 77.35 px -> feet reach y=306.65 (CANNOT reach High Ledge y=296).
 * - Standing on 1 teammate's head (feet at y=360): jump peak reaches y=282.65 -> clears High Ledge (y=296) cleanly by ~13 px.
 * - Pit gap (x=336..512 = 176 px) exceeds single horizontal jump reach -> requires Energy Bridge via Switch 1.
 * - Bridge Lock Switch 2 on East Platform latches bridge permanently so High Ledge player can cross safely.
 * - Vault Plates L (x=592..622) and R (x=656..686) have a 34 px gap (> 18 px player width) -> requires 2 bodies simultaneously.
 */
export const LEVEL_CHAMBER_01: LevelDefinition = {
  id: 'chamber-01',
  name: 'CHAMBER 01',
  subtitle: 'Synchrony · Stack, Bridge & Unlock Together',
  width: 800,
  height: 448,
  spawnOriginX: 44,
  spawnFloorY: 384,
  solids: [
    // Outer frame walls & ceiling
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West main floor (spawn & stacking chamber)
    { x: 24, y: 384, w: 312, h: 64 },
    // High Ledge (88 px above west floor — requires player stacking!)
    { x: 208, y: 296, w: 104, h: 14 },
    // Decorative upper support shelf on far left (optional playful jump target)
    { x: 40, y: 320, w: 72, h: 16 },
    // East platform (bridge lock, dual vault plates, and exit gate)
    { x: 512, y: 384, w: 264, h: 64 },
    // Pit side retaining walls below floor
    { x: 320, y: 384, w: 16, h: 64 },
    { x: 512, y: 384, w: 16, h: 64 },
  ],
  hazards: [
    // Neon plasma hazard pit beneath the bridge gap
    { x: 336, y: 420, w: 176, h: 28 },
  ],
  switches: [
    {
      id: 'bridge_hold',
      label: 'BRIDGE',
      kind: 'hold',
      accent: 'violet',
      x: 242,
      y: 288,
      w: 36,
      h: 8,
    },
    {
      id: 'bridge_lock',
      label: 'LOCK',
      kind: 'latch',
      accent: 'mint',
      x: 528,
      y: 376,
      w: 36,
      h: 8,
    },
    {
      id: 'vault_left',
      label: 'A',
      kind: 'vault',
      accent: 'violet',
      x: 592,
      y: 376,
      w: 30,
      h: 8,
    },
    {
      id: 'vault_right',
      label: 'B',
      kind: 'vault',
      accent: 'mint',
      x: 656,
      y: 376,
      w: 30,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'bridge_main',
      x: 336,
      y: 368,
      w: 176,
      h: 16,
      poweredBySwitchId: 'bridge_hold',
      latchedBySwitchId: 'bridge_lock',
    },
  ],
  exitDoor: {
    x: 720,
    y: 336,
    w: 44,
    h: 48,
  },
  wires: [
    // Wire from High Ledge Switch 1 to Bridge left emitter
    {
      id: 'wire_bridge_hold',
      accent: 'violet',
      linkedTo: 'bridge_hold',
      points: [
        { x: 260, y: 296 },
        { x: 260, y: 356 },
        { x: 336, y: 356 },
        { x: 336, y: 376 },
      ],
    },
    // Wire from Lock Switch 2 to Bridge right emitter
    {
      id: 'wire_bridge_lock',
      accent: 'mint',
      linkedTo: 'bridge_lock',
      points: [
        { x: 546, y: 384 },
        { x: 546, y: 404 },
        { x: 512, y: 404 },
        { x: 512, y: 376 },
      ],
    },
    // Wire from Vault Plate L to Exit Door
    {
      id: 'wire_vault_left',
      accent: 'violet',
      linkedTo: 'vault_left',
      points: [
        { x: 607, y: 384 },
        { x: 607, y: 416 },
        { x: 734, y: 416 },
        { x: 734, y: 384 },
      ],
    },
    // Wire from Vault Plate R to Exit Door
    {
      id: 'wire_vault_right',
      accent: 'mint',
      linkedTo: 'vault_right',
      points: [
        { x: 671, y: 384 },
        { x: 671, y: 404 },
        { x: 750, y: 404 },
        { x: 750, y: 384 },
      ],
    },
  ],
};

export function getSpawnPositionForSlot(level: LevelDefinition, slot: number): { x: number; y: number } {
  // Spread 8 slots cleanly across the safe west spawn zone without overlapping
  const spacing = 22;
  const clampedSlot = Math.max(0, Math.min(7, slot));
  return {
    x: level.spawnOriginX + clampedSlot * spacing,
    y: level.spawnFloorY - PHYSICS.PLAYER_HEIGHT,
  };
}
