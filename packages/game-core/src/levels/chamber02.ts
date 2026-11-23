import type { LevelDefinition } from '../types.js';

/**
 * Stage 2: Cadence (Medium ★★☆☆☆)
 * Fixed kinematics: BOTH Pit 1 (168 px) and Pit 2 (168 px) exceed horizontal jump reach (~113 px).
 */
export const LEVEL_CHAMBER_02: LevelDefinition = {
  id: 'chamber-02',
  code: '2',
  tier: 'normal',
  difficulty: 2,
  order: 2,
  name: 'STAGE 2',
  title: 'Cadence',
  subtitle: 'Ride the ferry & lift to grab the key, then sprint across the 5s timed bridge.',
  mechanicTag: 'TIMING',
  themeAccent: '#38BDF8',
  parTimeMs: {
    gold: 40_000,
    silver: 75_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 32,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West spawn deck (24..192, fits 8P cleanly)
    { x: 24, y: 384, w: 168, h: 64 },
    // Mid hub island (360..484, y=360)
    { x: 360, y: 360, w: 124, h: 88 },
    // Upper key catwalk (444..576, y=208)
    { x: 444, y: 208, w: 132, h: 16 },
    // East vault floor (652..776, y=360)
    { x: 652, y: 360, w: 124, h: 88 },
    // Security bulkhead above gate_east
    { x: 678, y: 24, w: 16, h: 264 },
  ],
  hazards: [
    // Pit 1: 168 px (impassable without ferry)
    { x: 192, y: 420, w: 168, h: 28 },
    // Pit 2: 168 px (FIXED: impassable without 5s timed bridge!)
    { x: 484, y: 420, w: 168, h: 28 },
  ],
  switches: [
    {
      id: 'timed_bridge_sw',
      label: '5s BRIDGE',
      kind: 'timed',
      accent: 'violet',
      durationTicks: 300,
      x: 432,
      y: 352,
      w: 44,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'bridge_timed',
      x: 484,
      y: 360,
      w: 168,
      h: 14,
      poweredBySwitchId: 'timed_bridge_sw',
      timedBySwitchId: 'timed_bridge_sw',
    },
  ],
  movingPlatforms: [
    {
      id: 'plat_ferry',
      startX: 200,
      startY: 362,
      endX: 296,
      endY: 362,
      w: 58,
      h: 14,
      cycleSeconds: 4.4,
      phaseOffset: 0,
      accent: 'sky',
    },
    {
      id: 'plat_lift',
      startX: 372,
      startY: 298,
      endX: 372,
      endY: 208,
      w: 54,
      h: 14,
      cycleSeconds: 4.0,
      phaseOffset: 0.25,
      accent: 'violet',
    },
  ],
  crates: [],
  keys: [
    {
      id: 'key_east',
      x: 510,
      y: 174,
      unlocksGateId: 'gate_east',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 'c2_1', x: 276, y: 312 },
    { id: 'c2_2', x: 552, y: 158 },
    { id: 'c2_3', x: 568, y: 310 },
  ],
  lockedGates: [
    {
      id: 'gate_east',
      label: 'KEY',
      accent: 'mint',
      x: 678,
      y: 288,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 718, y: 312, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_timed_bridge',
      accent: 'violet',
      linkedTo: 'timed_bridge_sw',
      points: [
        { x: 454, y: 360 },
        { x: 454, y: 384 },
        { x: 484, y: 384 },
        { x: 484, y: 367 },
      ],
    },
  ],
  cues: [
    { x: 276, y: 326, text: 'RIDE FERRY →', accent: 'mint' },
    { x: 510, y: 146, text: 'SECURITY KEY', accent: 'amber' },
    { x: 568, y: 334, text: 'TIMED 5s BRIDGE', accent: 'violet' },
  ],
};
