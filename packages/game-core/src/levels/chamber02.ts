import type { LevelDefinition } from '../types.js';

/**
 * Chamber 02: Cadence (Timing)
 * Mechanics: Moving Ferry Platform, Vertical Lift Platform, Timed 5s Energy Bridge, Key & Locked Security Gate.
 */
export const LEVEL_CHAMBER_02: LevelDefinition = {
  id: 'chamber-02',
  order: 2,
  name: 'CHAMBER 02',
  title: 'Cadence',
  subtitle: 'Time the moving ferry, grab the upper security key, and cross the timed bridge together.',
  mechanicTag: 'TIMING',
  parTimeMs: {
    gold: 40_000,
    silver: 75_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 36,
  spawnFloorY: 384,
  solids: [
    // Outer frame
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West spawn deck (24..200)
    { x: 24, y: 384, w: 176, h: 64 },
    // Mid hub island (368..520, y=360)
    { x: 368, y: 360, w: 152, h: 88 },
    // Upper key catwalk (456..592, y=208)
    { x: 456, y: 208, w: 136, h: 16 },
    // East vault floor (656..776, y=360)
    { x: 656, y: 360, w: 120, h: 88 },
    // Security bulkhead above gate_east so players must unlock the gate with key_east
    { x: 682, y: 24, w: 16, h: 264 },
  ],
  hazards: [
    // West chasm beneath moving ferry
    { x: 200, y: 420, w: 168, h: 28 },
    // East chasm beneath timed bridge
    { x: 520, y: 420, w: 136, h: 28 },
  ],
  switches: [
    {
      id: 'timed_bridge_sw',
      label: '5s BRIDGE',
      kind: 'timed',
      accent: 'violet',
      durationTicks: 300, // 5.0 seconds
      x: 454,
      y: 352,
      w: 44,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'bridge_timed',
      x: 520,
      y: 360,
      w: 136,
      h: 14,
      poweredBySwitchId: 'timed_bridge_sw',
      timedBySwitchId: 'timed_bridge_sw',
    },
  ],
  movingPlatforms: [
    {
      id: 'plat_ferry',
      startX: 208,
      startY: 362,
      endX: 304,
      endY: 362,
      w: 58,
      h: 14,
      cycleSeconds: 4.4,
      phaseOffset: 0,
      accent: 'mint',
    },
    {
      id: 'plat_lift',
      startX: 382,
      startY: 298,
      endX: 382,
      endY: 210,
      w: 58,
      h: 14,
      cycleSeconds: 4.2,
      phaseOffset: 0.25,
      accent: 'violet',
    },
  ],
  crates: [],
  keys: [
    {
      id: 'key_east',
      x: 524,
      y: 176,
      unlocksGateId: 'gate_east',
      accent: 'mint',
    },
  ],
  lockedGates: [
    {
      id: 'gate_east',
      label: 'KEY',
      accent: 'mint',
      x: 682,
      y: 288,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 720, y: 312, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_timed_bridge',
      accent: 'violet',
      linkedTo: 'timed_bridge_sw',
      points: [
        { x: 476, y: 360 },
        { x: 476, y: 384 },
        { x: 520, y: 384 },
        { x: 520, y: 367 },
      ],
    },
  ],
  cues: [
    { x: 284, y: 326, text: 'RIDE FERRY →', accent: 'mint' },
    { x: 524, y: 152, text: 'SECURITY KEY', accent: 'mint' },
    { x: 588, y: 334, text: 'TIMED 5s BRIDGE', accent: 'violet' },
  ],
};
