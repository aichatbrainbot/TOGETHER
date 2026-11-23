import type { LevelDefinition } from '../types.js';

/**
 * Special Stage S1: Skyline (Special ★★★★☆)
 * Vertical Tower Ascent using One-Way Platforms, Open-Sky Bounce Pads, Crumbling Sky Steps, and Timed Laser Sprint.
 */
export const LEVEL_SPECIAL_S1: LevelDefinition = {
  id: 'stage-s1',
  code: 'S1',
  tier: 'special',
  difficulty: 4,
  order: 5,
  name: 'STAGE S1',
  title: 'Skyline',
  subtitle: 'Ascend the neon tower via bounce pads, sky bridge lock, crumbling steps, and timed laser gate.',
  mechanicTag: 'SPECIAL · ASCENT',
  themeAccent: '#34D399',
  parTimeMs: {
    gold: 48_000,
    silver: 85_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 36,
  spawnFloorY: 396,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // Ground floor (west & mid safe deck)
    { x: 24, y: 396, w: 224, h: 52 },
    { x: 336, y: 396, w: 144, h: 52 },
    // Tier 2 center bridge hub (386..496, y=268 -> leaves clear sky above s1_pad1 at 344..378!)
    { x: 386, y: 268, w: 110, h: 16 },
    // East bounce tower (660..776, y=268)
    { x: 660, y: 268, w: 116, h: 16 },
    // Upper sky catwalk right (548..700, y=148 -> leaves clear sky above s1_pad2 at 724..758!)
    { x: 548, y: 148, w: 152, h: 14 },
    // Summit vault left (24..284, y=148)
    { x: 24, y: 148, w: 260, h: 16 },
  ],
  oneWayPlatforms: [
    { x: 160, y: 336, w: 96, h: 10 },
    { x: 256, y: 336, w: 96, h: 10 },
  ],
  hazards: [
    { x: 248, y: 424, w: 88, h: 24 },
    { x: 480, y: 424, w: 296, h: 24 },
  ],
  bouncePads: [
    { id: 's1_pad1', x: 344, y: 386, w: 34, h: 10, accent: 'mint' },
    { id: 's1_pad2', x: 724, y: 258, w: 34, h: 10, accent: 'amber' },
  ],
  crumblePlatforms: [
    { id: 's1_c1', x: 470, y: 148, w: 54, h: 12, delayTicks: 48, respawnTicks: 132 },
    { id: 's1_c2', x: 390, y: 148, w: 54, h: 12, delayTicks: 48, respawnTicks: 132 },
    { id: 's1_c3', x: 310, y: 148, w: 54, h: 12, delayTicks: 48, respawnTicks: 132 },
  ],
  lasers: [
    {
      id: 'laser_s1',
      x: 146,
      y: 24,
      w: 8,
      h: 124,
      disabledBySwitchId: 's1_laser_sw',
    },
  ],
  checkpoints: [
    {
      id: 'cp_s1',
      x: 672,
      y: 232,
      w: 18,
      h: 36,
      spawnX: 668,
      spawnFloorY: 268,
    },
  ],
  switches: [
    {
      id: 's1_bridge_hold',
      label: 'SKY BRIDGE',
      kind: 'hold',
      accent: 'violet',
      x: 416,
      y: 260,
      w: 44,
      h: 8,
    },
    {
      id: 's1_bridge_lock',
      label: 'LOCK',
      kind: 'latch',
      accent: 'mint',
      x: 696,
      y: 260,
      w: 24,
      h: 8,
    },
    {
      id: 's1_laser_sw',
      label: '3.3s GATE',
      kind: 'timed',
      accent: 'amber',
      durationTicks: 200,
      x: 214,
      y: 140,
      w: 44,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 's1_bridge',
      x: 496,
      y: 268,
      w: 164,
      h: 14,
      poweredBySwitchId: 's1_bridge_hold',
      latchedBySwitchId: 's1_bridge_lock',
    },
  ],
  movingPlatforms: [],
  crates: [],
  keys: [],
  coins: [
    { id: 's1_c1', x: 298, y: 290 },
    { id: 's1_c2', x: 578, y: 220 },
    { id: 's1_c3', x: 336, y: 100 },
  ],
  lockedGates: [],
  exitDoor: { x: 52, y: 100, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_s1_br',
      accent: 'violet',
      linkedTo: 's1_bridge_hold',
      points: [
        { x: 438, y: 268 },
        { x: 438, y: 294 },
        { x: 496, y: 294 },
        { x: 496, y: 275 },
      ],
    },
    {
      id: 'wire_s1_ls',
      accent: 'amber',
      linkedTo: 's1_laser_sw',
      points: [
        { x: 236, y: 148 },
        { x: 236, y: 172 },
        { x: 150, y: 172 },
        { x: 150, y: 148 },
      ],
    },
  ],
  cues: [
    { x: 360, y: 356, text: 'LAUNCH ↑', accent: 'mint' },
    { x: 418, y: 124, text: '← SKY CRUMBLE', accent: 'amber' },
  ],
};

/**
 * Special Stage S2: Crossfire (Special ★★★★★)
 * Dual Laser Gauntlet, Fast Moving Ferry + Vertical Lift, Mid Checkpoint, 4s Timed Bridge, Security Key.
 */
export const LEVEL_SPECIAL_S2: LevelDefinition = {
  id: 'stage-s2',
  code: 'S2',
  tier: 'special',
  difficulty: 5,
  order: 6,
  name: 'STAGE S2',
  title: 'Crossfire',
  subtitle: 'Disable dual security lasers, time fast ferries, grab the key, and beat the 4s bridge.',
  mechanicTag: 'SPECIAL · GAUNTLET',
  themeAccent: '#FB7185',
  parTimeMs: {
    gold: 52_000,
    silver: 95_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 26,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West deck (24..196)
    { x: 24, y: 384, w: 172, h: 64 },
    // Upper West laser balcony (88..168, y=208 -> clear sky above s2_pad_w at 36..70!)
    { x: 88, y: 208, w: 80, h: 14 },
    // Bulkhead above Laser 1
    { x: 174, y: 24, w: 14, h: 280 },
    // Mid Fortress (364..488, y=368)
    { x: 364, y: 368, w: 124, h: 80 },
    // Upper Key Alcove (372..512, y=212 -> clear shaft above s2_lift at 310..362!)
    { x: 372, y: 212, w: 140, h: 16 },
    // East Vault (656..776, y=368)
    { x: 656, y: 368, w: 120, h: 80 },
    // Security bulkhead above gate_s2
    { x: 684, y: 24, w: 16, h: 272 },
  ],
  oneWayPlatforms: [{ x: 32, y: 320, w: 72, h: 10 }],
  hazards: [
    { x: 196, y: 420, w: 168, h: 28 },
    { x: 488, y: 420, w: 168, h: 28 },
  ],
  bouncePads: [{ id: 's2_pad_w', x: 36, y: 310, w: 34, h: 10, accent: 'mint' }],
  lasers: [
    {
      id: 's2_laser1',
      x: 177,
      y: 304,
      w: 8,
      h: 80,
      disabledBySwitchId: 's2_l1_hold',
      alsoDisabledBySwitchId: 's2_l1_lock',
    },
    {
      id: 's2_laser2',
      x: 568,
      y: 24,
      w: 8,
      h: 344,
      disabledBySwitchId: 's2_l2_lock',
    },
  ],
  checkpoints: [
    {
      id: 'cp_s2',
      x: 372,
      y: 332,
      w: 18,
      h: 36,
      spawnX: 372,
      spawnFloorY: 368,
    },
  ],
  switches: [
    {
      id: 's2_l1_hold',
      label: 'L1 OFF',
      kind: 'hold',
      accent: 'violet',
      x: 108,
      y: 200,
      w: 40,
      h: 8,
    },
    {
      id: 's2_l1_lock',
      label: '2P LOCK',
      kind: 'latch',
      accent: 'mint',
      requiredPlayers: 2,
      x: 396,
      y: 360,
      w: 42,
      h: 8,
    },
    {
      id: 's2_l2_lock',
      label: 'L2 OFF',
      kind: 'latch',
      accent: 'mint',
      x: 454,
      y: 204,
      w: 40,
      h: 8,
    },
    {
      id: 's2_timed',
      label: '3.3s RUN',
      kind: 'timed',
      accent: 'amber',
      durationTicks: 200,
      x: 444,
      y: 360,
      w: 38,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 's2_bridge_timed',
      x: 488,
      y: 368,
      w: 168,
      h: 14,
      poweredBySwitchId: 's2_timed',
      timedBySwitchId: 's2_timed',
    },
  ],
  movingPlatforms: [
    {
      id: 's2_ferry',
      startX: 204,
      startY: 368,
      endX: 298,
      endY: 368,
      w: 56,
      h: 14,
      cycleSeconds: 3.2,
      phaseOffset: 0,
      accent: 'sky',
    },
    {
      id: 's2_lift',
      startX: 310,
      startY: 310,
      endX: 310,
      endY: 212,
      w: 52,
      h: 14,
      cycleSeconds: 3.1,
      phaseOffset: 0.3,
      accent: 'violet',
    },
  ],
  crates: [],
  keys: [
    {
      id: 'key_s2',
      x: 416,
      y: 176,
      unlocksGateId: 'gate_s2',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 's2_c1', x: 128, y: 158 },
    { id: 's2_c2', x: 392, y: 162 },
    { id: 's2_c3', x: 572, y: 318 },
  ],
  lockedGates: [
    {
      id: 'gate_s2',
      label: 'KEY',
      accent: 'amber',
      x: 684,
      y: 296,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 720, y: 320, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_s2_l1',
      accent: 'danger',
      linkedTo: 's2_l1_hold',
      points: [
        { x: 128, y: 208 },
        { x: 128, y: 318 },
        { x: 177, y: 318 },
      ],
    },
    {
      id: 'wire_s2_l2',
      accent: 'mint',
      linkedTo: 's2_l2_lock',
      points: [
        { x: 474, y: 212 },
        { x: 474, y: 266 },
        { x: 568, y: 266 },
      ],
    },
  ],
  cues: [
    { x: 120, y: 184, text: 'CUT LASER 1', accent: 'violet', hideWhenSwitchLatched: 's2_l1_lock' },
    { x: 572, y: 344, text: '4s LASER SPRINT', accent: 'amber' },
  ],
};

/**
 * Special Stage S3: Foundry (Special ★★★★★)
 * Double Cooperative Crate Alchemy (x1 + x2), West Laser Override, Open-Shaft Cargo Lift, Elevated Key, Checkpoint.
 */
export const LEVEL_SPECIAL_S3: LevelDefinition = {
  id: 'stage-s3',
  code: 'S3',
  tier: 'special',
  difficulty: 5,
  order: 7,
  name: 'STAGE S3',
  title: 'Foundry',
  subtitle: 'Cut the mezzanine laser, weigh down the lift with x1, push heavy x2 together, and claim the key.',
  mechanicTag: 'SPECIAL · FOUNDRY',
  themeAccent: '#FBBF24',
  parTimeMs: {
    gold: 60_000,
    silver: 105_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 28,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // Lower Foundry floor (24..444)
    { x: 24, y: 384, w: 420, h: 64 },
    // West Laser Control Alcove (52..170, y=252 -> leaves clear sky above s3_pad_w at 180..212!)
    { x: 52, y: 252, w: 118, h: 14 },
    // Upper Heavy Crate Mezzanine (286..556, y=244 -> leaves clear lift shaft at 224..280!)
    { x: 286, y: 244, w: 270, h: 16 },
    // Bulkhead above mezzanine laser so players must disable s3_mezz_laser
    { x: 294, y: 24, w: 14, h: 140 },
    // Right crate stopper lip
    { x: 542, y: 228, w: 14, h: 16 },
    // East Sanctuary (612..776, y=384)
    { x: 612, y: 384, w: 164, h: 64 },
    // Bulkhead above gate_s3
    { x: 668, y: 24, w: 16, h: 288 },
  ],
  hazards: [{ x: 444, y: 420, w: 168, h: 28 }],
  bouncePads: [{ id: 's3_pad_w', x: 180, y: 374, w: 32, h: 10, accent: 'amber' }],
  lasers: [
    {
      id: 's3_mezz_laser',
      x: 297,
      y: 164,
      w: 8,
      h: 80,
      disabledBySwitchId: 's3_laser_sw',
    },
  ],
  checkpoints: [
    {
      id: 'cp_s3',
      x: 620,
      y: 348,
      w: 18,
      h: 36,
      spawnX: 620,
      spawnFloorY: 384,
    },
  ],
  switches: [
    {
      id: 's3_laser_sw',
      label: 'KILL LASER',
      kind: 'latch',
      accent: 'mint',
      x: 92,
      y: 244,
      w: 44,
      h: 8,
    },
    {
      id: 's3_lift_sw',
      label: 'LIFT',
      kind: 'hold',
      accent: 'amber',
      allowsCrate: true,
      x: 372,
      y: 376,
      w: 44,
      h: 8,
    },
    {
      id: 's3_bridge_sw',
      label: 'BRIDGE',
      kind: 'latch',
      accent: 'violet',
      allowsCrate: true,
      x: 478,
      y: 236,
      w: 48,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 's3_bridge',
      x: 444,
      y: 384,
      w: 168,
      h: 16,
      poweredBySwitchId: 's3_bridge_sw',
      latchedBySwitchId: 's3_bridge_sw',
    },
  ],
  movingPlatforms: [
    {
      id: 's3_lift',
      startX: 224,
      startY: 368,
      endX: 224,
      endY: 244,
      w: 56,
      h: 14,
      cycleSeconds: 4.0,
      phaseOffset: 0,
      poweredBySwitchId: 's3_lift_sw',
      accent: 'mint',
    },
  ],
  crates: [
    {
      id: 's3_crate1',
      x: 304,
      y: 356,
      w: 28,
      h: 28,
      requiredPushers: 1,
      accent: 'amber',
    },
    {
      id: 's3_crate2',
      x: 336,
      y: 210,
      w: 34,
      h: 34,
      requiredPushers: 2,
      accent: 'violet',
    },
  ],
  keys: [
    {
      id: 'key_s3',
      x: 502,
      y: 116, // 128 px above mezzanine (244) -> strictly requires standing on s3_crate2!
      unlocksGateId: 'gate_s3',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 's3_c1', x: 64, y: 206 },
    { id: 's3_c2', x: 252, y: 196 },
    { id: 's3_c3', x: 528, y: 332 },
  ],
  lockedGates: [
    {
      id: 'gate_s3',
      label: 'KEY',
      accent: 'amber',
      x: 668,
      y: 312,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 718, y: 336, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_s3_ls',
      accent: 'mint',
      linkedTo: 's3_laser_sw',
      points: [
        { x: 114, y: 252 },
        { x: 114, y: 286 },
        { x: 301, y: 286 },
        { x: 301, y: 244 },
      ],
    },
    {
      id: 'wire_s3_br',
      accent: 'violet',
      linkedTo: 's3_bridge_sw',
      points: [
        { x: 502, y: 244 },
        { x: 502, y: 354 },
        { x: 444, y: 354 },
        { x: 444, y: 390 },
      ],
    },
  ],
  cues: [
    { x: 112, y: 224, text: 'BOUNCE FOR LASER', accent: 'mint', hideWhenSwitchLatched: 's3_laser_sw' },
    { x: 416, y: 192, text: 'PUSH x2 → CLIMB FOR KEY', accent: 'violet' },
  ],
};

/**
 * Special Stage S4: Apex (Master ★★★★★)
 * Grand Finale synthesizing EVERY mechanic: Head-Stacking, Powered Ferry, Checkpoint, Open-Sky Bounce Pad,
 * Heavy x2 Crate, Full-Height Laser Override, Bridge + Crumble Combo, Key Gate, and Exit!
 */
export const LEVEL_SPECIAL_S4: LevelDefinition = {
  id: 'stage-s4',
  code: 'S4',
  tier: 'special',
  difficulty: 5,
  order: 8,
  name: 'STAGE S4',
  title: 'Apex',
  subtitle: 'The ultimate cooperative gauntlet: stack, ferry, bounce, heavy x2 crate, crumble run & key gate.',
  mechanicTag: 'MASTER · FINALE',
  themeAccent: '#F472B6',
  parTimeMs: {
    gold: 70_000,
    silver: 120_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 26,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West floor (24..184)
    { x: 24, y: 384, w: 160, h: 64 },
    // Stack High Shelf (96..176, y=296 -> 88 px above 384, requires head-stacking!)
    { x: 96, y: 296, w: 80, h: 14 },
    // Mid Core (348..480, y=368)
    { x: 348, y: 368, w: 132, h: 80 },
    // Upper Apex Deck (396..596, y=234 -> clear sky above s4_pad at 352..384!)
    { x: 396, y: 234, w: 200, h: 16 },
    // Crate stopper lip on right of Apex Deck
    { x: 582, y: 218, w: 14, h: 16 },
    // East Apex Sanctuary (644..776, y=368)
    { x: 644, y: 368, w: 132, h: 80 },
    // Bulkhead above gate_s4
    { x: 668, y: 24, w: 16, h: 272 },
  ],
  hazards: [
    // Pit 1: 164 px
    { x: 184, y: 420, w: 164, h: 28 },
    // Pit 2: 164 px
    { x: 480, y: 420, w: 164, h: 28 },
  ],
  bouncePads: [{ id: 's4_pad', x: 352, y: 358, w: 32, h: 10, accent: 'mint' }],
  crumblePlatforms: [
    { id: 's4_crumble', x: 582, y: 368, w: 52, h: 14, delayTicks: 38, respawnTicks: 120 },
  ],
  lasers: [
    {
      id: 's4_laser',
      x: 462,
      y: 250,
      w: 8,
      h: 118,
      disabledBySwitchId: 's4_heavy_lock',
    },
  ],
  checkpoints: [
    {
      id: 'cp_s4',
      x: 416,
      y: 332,
      w: 18,
      h: 36,
      spawnX: 404,
      spawnFloorY: 368,
    },
  ],
  switches: [
    {
      id: 's4_ferry_sw',
      label: 'FERRY',
      kind: 'latch',
      accent: 'mint',
      x: 118,
      y: 288,
      w: 38,
      h: 8,
    },
    {
      id: 's4_heavy_lock',
      label: 'BRIDGE+LASER',
      kind: 'latch',
      accent: 'violet',
      allowsCrate: true,
      x: 520,
      y: 226,
      w: 48,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 's4_bridge',
      x: 480,
      y: 368,
      w: 94,
      h: 14,
      poweredBySwitchId: 's4_heavy_lock',
      latchedBySwitchId: 's4_heavy_lock',
    },
  ],
  movingPlatforms: [
    {
      id: 's4_ferry',
      startX: 192,
      startY: 368,
      endX: 282,
      endY: 368,
      w: 58,
      h: 14,
      cycleSeconds: 3.4,
      phaseOffset: 0,
      poweredBySwitchId: 's4_ferry_sw',
      accent: 'sky',
    },
  ],
  crates: [
    {
      id: 's4_heavy',
      x: 420,
      y: 200,
      w: 34,
      h: 34,
      requiredPushers: 2,
      accent: 'violet',
    },
  ],
  keys: [
    {
      id: 'key_s4',
      x: 544,
      y: 106, // 128 px above Apex Deck (234) -> strictly requires standing on s4_heavy!
      unlocksGateId: 'gate_s4',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 's4_c1', x: 112, y: 244 },
    { id: 's4_c2', x: 422, y: 184 },
    { id: 's4_c3', x: 608, y: 318 },
  ],
  lockedGates: [
    {
      id: 'gate_s4',
      label: 'APEX',
      accent: 'violet',
      x: 668,
      y: 296,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 718, y: 320, w: 44, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_s4_f',
      accent: 'mint',
      linkedTo: 's4_ferry_sw',
      points: [
        { x: 137, y: 296 },
        { x: 137, y: 354 },
        { x: 184, y: 354 },
      ],
    },
    {
      id: 'wire_s4_hl',
      accent: 'violet',
      linkedTo: 's4_heavy_lock',
      points: [
        { x: 544, y: 234 },
        { x: 544, y: 288 },
        { x: 466, y: 288 },
      ],
    },
  ],
  cues: [
    { x: 84, y: 344, text: 'STACK ↑', accent: 'mint', hideWhenSwitchLatched: 's4_ferry_sw' },
    { x: 492, y: 180, text: 'PUSH x2 + KEY', accent: 'violet' },
    { x: 562, y: 344, text: 'BRIDGE → CRUMBLE', accent: 'amber' },
  ],
};
