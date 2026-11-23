import type { LevelDefinition } from '../types.js';

/**
 * Stage 4: Relay (Hard ★★★★☆)
 * Introduces Bounce Pad + Switch-Disabled Laser Beam + Crumbling Steps + Checkpoint + Moving Lift + Dual Vault Exit.
 */
export const LEVEL_CHAMBER_04: LevelDefinition = {
  id: 'chamber-04',
  code: '4',
  tier: 'normal',
  difficulty: 4,
  order: 4,
  name: 'STAGE 4',
  title: 'Relay',
  subtitle: 'Bounce to the laser balcony, cross crumbling steps to the checkpoint, and unlock the summit.',
  mechanicTag: 'RELAY',
  themeAccent: '#A78BFA',
  parTimeMs: {
    gold: 50_000,
    silver: 90_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 26,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West floor (24..248)
    { x: 24, y: 384, w: 224, h: 64 },
    // Control balcony above west floor (56..168, y=252 -> 132 px up, requires Bounce Pad!)
    { x: 56, y: 252, w: 112, h: 14 },
    // Bulkhead wall above mid laser so players must disable laser_mid
    { x: 220, y: 24, w: 16, h: 280 },
    // Central checkpoint hub (468..564, y=368)
    { x: 468, y: 368, w: 96, h: 80 },
    // East summit platform (636..776, y=312)
    { x: 636, y: 312, w: 140, h: 136 },
  ],
  hazards: [
    // Crumble chasm: 220 px wide (248..468)
    { x: 248, y: 420, w: 220, h: 28 },
    // East lift chasm: 72 px drop hazard (564..636)
    { x: 564, y: 420, w: 72, h: 28 },
  ],
  bouncePads: [
    {
      id: 'pad_west',
      x: 176,
      y: 374,
      w: 32,
      h: 10,
      accent: 'mint',
    },
  ],
  crumblePlatforms: [
    { id: 'crumble_1', x: 266, y: 368, w: 48, h: 14, delayTicks: 52, respawnTicks: 140 },
    { id: 'crumble_2', x: 334, y: 368, w: 48, h: 14, delayTicks: 52, respawnTicks: 140 },
    { id: 'crumble_3', x: 402, y: 368, w: 48, h: 14, delayTicks: 52, respawnTicks: 140 },
  ],
  lasers: [
    {
      id: 'laser_mid',
      x: 224,
      y: 304,
      w: 8,
      h: 80,
      disabledBySwitchId: 'laser_hold',
      alsoDisabledBySwitchId: 'laser_lock',
    },
  ],
  checkpoints: [
    {
      id: 'cp_stage4',
      x: 478,
      y: 332,
      w: 18,
      h: 36,
      spawnX: 476,
      spawnFloorY: 368,
    },
  ],
  switches: [
    {
      id: 'laser_hold',
      label: 'LASER',
      kind: 'hold',
      accent: 'violet',
      x: 92,
      y: 244,
      w: 40,
      h: 8,
    },
    {
      id: 'laser_lock',
      label: 'KILL LASER',
      kind: 'latch',
      accent: 'mint',
      x: 512,
      y: 360,
      w: 40,
      h: 8,
    },
    {
      id: 'vault_4a',
      label: 'A',
      kind: 'vault',
      accent: 'violet',
      x: 644,
      y: 304,
      w: 26,
      h: 8,
    },
    {
      id: 'vault_4b',
      label: 'B',
      kind: 'vault',
      accent: 'mint',
      x: 690,
      y: 304,
      w: 26,
      h: 8,
    },
  ],
  bridges: [],
  movingPlatforms: [
    {
      id: 'plat_summit',
      startX: 572,
      startY: 368,
      endX: 572,
      endY: 312,
      w: 56,
      h: 14,
      cycleSeconds: 3.6,
      phaseOffset: 0,
      accent: 'sky',
    },
  ],
  crates: [],
  keys: [],
  lockedGates: [],
  exitDoor: { x: 726, y: 264, w: 42, h: 48 },
  requiresVaultSwitches: true,
  wires: [
    {
      id: 'wire_l_hold',
      accent: 'danger',
      linkedTo: 'laser_hold',
      points: [
        { x: 112, y: 252 },
        { x: 112, y: 318 },
        { x: 224, y: 318 },
      ],
    },
    {
      id: 'wire_l_lock',
      accent: 'mint',
      linkedTo: 'laser_lock',
      points: [
        { x: 532, y: 368 },
        { x: 532, y: 404 },
        { x: 228, y: 404 },
        { x: 228, y: 384 },
      ],
    },
    {
      id: 'wire_4va',
      accent: 'violet',
      linkedTo: 'vault_4a',
      points: [
        { x: 657, y: 312 },
        { x: 657, y: 344 },
        { x: 740, y: 344 },
        { x: 740, y: 312 },
      ],
    },
    {
      id: 'wire_4vb',
      accent: 'mint',
      linkedTo: 'vault_4b',
      points: [
        { x: 703, y: 312 },
        { x: 703, y: 332 },
        { x: 754, y: 332 },
        { x: 754, y: 312 },
      ],
    },
  ],
  cues: [
    { x: 184, y: 344, text: 'BOUNCE ↑', accent: 'mint', hideWhenSwitchLatched: 'laser_lock' },
    { x: 358, y: 340, text: 'CRUMBLE RUN →', accent: 'amber' },
    { x: 680, y: 280, text: 'HOLD A + B', accent: 'mint', hideWhenUnlocked: true },
  ],
};
