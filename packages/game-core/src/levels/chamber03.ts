import type { LevelDefinition } from '../types.js';

/**
 * Stage 3: Leverage (Challenging ★★★☆☆)
 * Fixed kinematics: Chasm is 164 px (impassable without heavy x2 crate bridge!),
 * Cargo lift has 100% open vertical shaft (x=182..238, left of Mezzanine x=246..546),
 * and Key sits 110 px above mezzanine (y=138) so climbing crate_heavy is strictly required.
 */
export const LEVEL_CHAMBER_03: LevelDefinition = {
  id: 'chamber-03',
  code: '3',
  tier: 'normal',
  difficulty: 3,
  order: 3,
  name: 'STAGE 3',
  title: 'Leverage',
  subtitle: 'Weigh down the lift relay with x1, shove the heavy x2 crate together, and climb for the key.',
  mechanicTag: 'TEAMWORK',
  themeAccent: '#F5A623',
  parTimeMs: {
    gold: 55_000,
    silver: 95_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 28,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // Lower West/Mid deck (24..432)
    { x: 24, y: 384, w: 408, h: 64 },
    // Upper Mezzanine deck (246..546, y=248) -> leaves clear vertical lift shaft at x=182..238
    { x: 246, y: 248, w: 300, h: 16 },
    // Crate stopper lip on right end of mezzanine
    { x: 532, y: 232, w: 14, h: 16 },
    // East Exit floor (596..776)
    { x: 596, y: 384, w: 180, h: 64 },
    // Bulkhead above gate_final
    { x: 654, y: 24, w: 16, h: 288 },
  ],
  hazards: [
    // 164 px chasm -> strictly impassable without bridge_team!
    { x: 432, y: 420, w: 164, h: 28 },
  ],
  switches: [
    {
      id: 'lift_plate',
      label: 'LIFT',
      kind: 'hold',
      accent: 'amber',
      allowsCrate: true,
      x: 342,
      y: 376,
      w: 44,
      h: 8,
    },
    {
      id: 'heavy_plate',
      label: 'BRIDGE',
      kind: 'latch',
      accent: 'violet',
      allowsCrate: true,
      x: 466,
      y: 240,
      w: 48,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'bridge_team',
      x: 432,
      y: 384,
      w: 164,
      h: 16,
      poweredBySwitchId: 'heavy_plate',
      latchedBySwitchId: 'heavy_plate',
    },
  ],
  movingPlatforms: [
    {
      id: 'plat_cargo',
      startX: 182,
      startY: 368,
      endX: 182,
      endY: 248,
      w: 56,
      h: 14,
      cycleSeconds: 4.2,
      phaseOffset: 0,
      poweredBySwitchId: 'lift_plate',
      accent: 'mint',
    },
  ],
  crates: [
    {
      id: 'crate_light',
      x: 264,
      y: 356,
      w: 28,
      h: 28,
      requiredPushers: 1,
      accent: 'amber',
    },
    {
      id: 'crate_heavy',
      x: 278,
      y: 214,
      w: 34,
      h: 34,
      requiredPushers: 2,
      accent: 'violet',
    },
  ],
  keys: [
    {
      id: 'key_vault',
      x: 490,
      y: 120, // 128 px above mezzanine (248) -> strictly unreachable from floor (head peak 148), easy from crate_heavy!
      unlocksGateId: 'gate_final',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 'c3_1', x: 148, y: 320 },
    { id: 'c3_2', x: 210, y: 204 },
    { id: 'c3_3', x: 514, y: 332 },
  ],
  lockedGates: [
    {
      id: 'gate_final',
      label: 'KEY',
      accent: 'amber',
      x: 654,
      y: 312,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 716, y: 336, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_lift',
      accent: 'amber',
      linkedTo: 'lift_plate',
      points: [
        { x: 364, y: 384 },
        { x: 364, y: 406 },
        { x: 210, y: 406 },
        { x: 210, y: 384 },
      ],
    },
    {
      id: 'wire_heavy_bridge',
      accent: 'violet',
      linkedTo: 'heavy_plate',
      points: [
        { x: 490, y: 248 },
        { x: 490, y: 348 },
        { x: 432, y: 348 },
        { x: 432, y: 390 },
      ],
    },
  ],
  cues: [
    { x: 318, y: 334, text: 'PUSH x1 ONTO LIFT', accent: 'amber' },
    { x: 360, y: 196, text: 'PUSH x2 TOGETHER →', accent: 'violet', hideWhenSwitchLatched: 'heavy_plate' },
    { x: 490, y: 92, text: 'CLIMB CRATE FOR KEY', accent: 'amber' },
  ],
};
