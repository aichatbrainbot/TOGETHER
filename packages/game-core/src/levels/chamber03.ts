import type { LevelDefinition } from '../types.js';

/**
 * Chamber 03: Leverage (Teamwork)
 * Mechanics: Light Crate (x1) powers Cargo Lift, Heavy Co-op Crate (x2 pushers) locks Bridge,
 * climb Heavy Crate for Security Key, unlock Final Gate, and exit together.
 */
export const LEVEL_CHAMBER_03: LevelDefinition = {
  id: 'chamber-03',
  order: 3,
  name: 'CHAMBER 03',
  title: 'Leverage',
  subtitle: 'Weigh down the lift relay, push the heavy x2 crate together, grab the key, and escape.',
  mechanicTag: 'TEAMWORK',
  parTimeMs: {
    gold: 55_000,
    silver: 95_000,
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
    // Lower West/Mid deck (24..464, y=384)
    { x: 24, y: 384, w: 440, h: 64 },
    // Upper Mezzanine deck for Heavy Crate (204..540, y=248)
    { x: 204, y: 248, w: 336, h: 16 },
    // Low crate-stopper lip on right end of mezzanine so crate_heavy cannot fall off cliff
    { x: 526, y: 232, w: 14, h: 16 },
    // East Exit floor (544..776, y=384)
    { x: 544, y: 384, w: 232, h: 64 },
    // Security bulkhead above gate_final
    { x: 634, y: 24, w: 16, h: 288 },
  ],
  hazards: [
    // Chasm between lower deck and east exit floor
    { x: 464, y: 420, w: 80, h: 28 },
  ],
  switches: [
    {
      id: 'lift_plate',
      label: 'LIFT',
      kind: 'hold',
      accent: 'mint',
      allowsCrate: true,
      x: 306,
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
      x: 458,
      y: 240,
      w: 48,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'bridge_team',
      x: 464,
      y: 384,
      w: 80,
      h: 16,
      poweredBySwitchId: 'heavy_plate',
      latchedBySwitchId: 'heavy_plate',
    },
  ],
  movingPlatforms: [
    {
      id: 'plat_cargo',
      startX: 392,
      startY: 368,
      endX: 392,
      endY: 256,
      w: 60,
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
      x: 232,
      y: 356,
      w: 28,
      h: 28,
      requiredPushers: 1,
      accent: 'mint',
    },
    {
      id: 'crate_heavy',
      x: 258,
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
      x: 472,
      y: 164,
      unlocksGateId: 'gate_final',
      accent: 'violet',
    },
  ],
  lockedGates: [
    {
      id: 'gate_final',
      label: 'KEY',
      accent: 'violet',
      x: 634,
      y: 312,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 710, y: 336, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_lift',
      accent: 'mint',
      linkedTo: 'lift_plate',
      points: [
        { x: 328, y: 384 },
        { x: 328, y: 404 },
        { x: 422, y: 404 },
        { x: 422, y: 384 },
      ],
    },
    {
      id: 'wire_heavy_bridge',
      accent: 'violet',
      linkedTo: 'heavy_plate',
      points: [
        { x: 482, y: 248 },
        { x: 482, y: 344 },
        { x: 504, y: 344 },
        { x: 504, y: 384 },
      ],
    },
  ],
  cues: [
    { x: 278, y: 336, text: 'PUSH x1 ONTO LIFT', accent: 'mint' },
    { x: 336, y: 196, text: 'PUSH x2 TOGETHER →', accent: 'violet', hideWhenSwitchLatched: 'heavy_plate' },
    { x: 480, y: 140, text: 'CLIMB CRATE FOR KEY', accent: 'violet' },
  ],
};
