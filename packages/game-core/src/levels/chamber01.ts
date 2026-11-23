import type { LevelDefinition } from '../types.js';

/**
 * Chamber 01: Synchrony (Cooperation)
 * Mechanics: Head-stacking, Hold Energy Bridge, Permanent Lock Switch, Dual Vault Plates.
 */
export const LEVEL_CHAMBER_01: LevelDefinition = {
  id: 'chamber-01',
  order: 1,
  name: 'CHAMBER 01',
  title: 'Synchrony',
  subtitle: 'Stack on teammates, lock the energy bridge, and unlock the vault together.',
  mechanicTag: 'COOPERATION',
  parTimeMs: {
    gold: 35_000,
    silver: 65_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 44,
  spawnFloorY: 384,
  solids: [
    // Outer boundary frame
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West main floor
    { x: 24, y: 384, w: 312, h: 64 },
    // High Ledge (88 px above floor -> requires player stacking!)
    { x: 208, y: 296, w: 104, h: 14 },
    // Left playful shelf
    { x: 40, y: 320, w: 72, h: 14 },
    // East vault floor
    { x: 512, y: 384, w: 264, h: 64 },
    // Pit walls
    { x: 320, y: 384, w: 16, h: 64 },
    { x: 512, y: 384, w: 16, h: 64 },
  ],
  hazards: [{ x: 336, y: 420, w: 176, h: 28 }],
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
  movingPlatforms: [],
  crates: [],
  keys: [],
  lockedGates: [],
  exitDoor: { x: 720, y: 336, w: 44, h: 48 },
  requiresVaultSwitches: true,
  wires: [
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
  cues: [
    { x: 182, y: 344, text: 'STACK HERE ↑', accent: 'violet', hideWhenSwitchLatched: 'bridge_lock' },
    { x: 639, y: 348, text: 'HOLD A + B TOGETHER', accent: 'mint', hideWhenUnlocked: true },
  ],
};
