import type { LevelDefinition } from '../types.js';

/**
 * Nightmare Stage N1: Voltage (Nightmare ★★★★★)
 * High-tension Bounce + 3.2s Timed Laser Sprint + Crumbling Steps + Sky Key + 3.2s Bridge + Dual Vault.
 */
export const LEVEL_NIGHTMARE_N1: LevelDefinition = {
  id: 'stage-n1',
  code: 'N1',
  tier: 'nightmare',
  difficulty: 5,
  order: 9,
  name: 'STAGE N1',
  title: 'Voltage',
  subtitle: 'Beat 3.2s timed lasers and crumbling spires, grab the sky key, and charge the dual vault.',
  mechanicTag: 'NIGHTMARE · SURGE',
  themeAccent: '#F43F5E',
  parTimeMs: {
    gold: 52_000,
    silver: 90_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 28,
  spawnFloorY: 388,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West spawn deck (24..208)
    { x: 24, y: 388, w: 184, h: 60 },
    // Upper Voltage Laser Balcony (112..244, y=198 -> clear sky above n1_pad1 at 48..82!)
    { x: 112, y: 198, w: 132, h: 14 },
    // Mid Bulkhead above n1_laser1 (x=200, y=212..308)
    { x: 200, y: 212, w: 14, h: 96 },
    // Central Capacitor Core (356..478, y=372)
    { x: 356, y: 372, w: 122, h: 76 },
    // Upper Sky Key Catwalk (454..572, y=244 -> clear sky above n1_pad2 at 400..434!)
    { x: 454, y: 244, w: 118, h: 14 },
    // East Vault (616..776, y=356)
    { x: 616, y: 356, w: 160, h: 92 },
    // East Security Bulkhead above gate_n1
    { x: 656, y: 24, w: 16, h: 260 },
  ],
  oneWayPlatforms: [{ x: 40, y: 328, w: 96, h: 10 }],
  hazards: [
    { x: 208, y: 422, w: 148, h: 26 },
    { x: 478, y: 422, w: 138, h: 26 },
  ],
  bouncePads: [
    { id: 'n1_pad1', x: 48, y: 318, w: 34, h: 10, accent: 'mint' },
    { id: 'n1_pad2', x: 400, y: 362, w: 34, h: 10, accent: 'amber' },
  ],
  crumblePlatforms: [
    { id: 'n1_c1', x: 228, y: 382, w: 46, h: 12, delayTicks: 34, respawnTicks: 108 },
    { id: 'n1_c2', x: 294, y: 374, w: 46, h: 12, delayTicks: 34, respawnTicks: 108 },
  ],
  lasers: [
    {
      id: 'n1_laser1',
      x: 204,
      y: 308,
      w: 8,
      h: 80,
      disabledBySwitchId: 'n1_laser_sw',
    },
  ],
  checkpoints: [
    {
      id: 'cp_n1',
      x: 364,
      y: 336,
      w: 18,
      h: 36,
      spawnX: 364,
      spawnFloorY: 372,
    },
  ],
  switches: [
    {
      id: 'n1_laser_sw',
      label: '3.2s GATE',
      kind: 'timed',
      accent: 'amber',
      durationTicks: 192,
      x: 192,
      y: 190,
      w: 40,
      h: 8,
    },
    {
      id: 'n1_br_sw',
      label: '3.2s RUN',
      kind: 'timed',
      accent: 'violet',
      durationTicks: 192,
      x: 438,
      y: 364,
      w: 36,
      h: 8,
    },
    {
      id: 'vault_n1a',
      label: 'A',
      kind: 'vault',
      accent: 'violet',
      x: 680,
      y: 348,
      w: 22,
      h: 8,
    },
    {
      id: 'vault_n1b',
      label: 'B',
      kind: 'vault',
      accent: 'mint',
      x: 706,
      y: 348,
      w: 22,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'n1_bridge',
      x: 478,
      y: 372,
      w: 138,
      h: 14,
      poweredBySwitchId: 'n1_br_sw',
      timedBySwitchId: 'n1_br_sw',
    },
  ],
  movingPlatforms: [],
  crates: [],
  keys: [
    {
      id: 'key_n1',
      x: 544,
      y: 212,
      unlocksGateId: 'gate_n1',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 'n1_coin1', x: 178, y: 154 },
    { id: 'n1_coin2', x: 416, y: 260 },
    { id: 'n1_coin3', x: 550, y: 320 },
  ],
  lockedGates: [
    {
      id: 'gate_n1',
      label: 'VOLT',
      accent: 'amber',
      x: 656,
      y: 284,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 734, y: 308, w: 40, h: 48 },
  requiresVaultSwitches: true,
  wires: [
    {
      id: 'wire_n1_ls',
      accent: 'amber',
      linkedTo: 'n1_laser_sw',
      points: [
        { x: 212, y: 198 },
        { x: 212, y: 308 },
      ],
    },
    {
      id: 'wire_n1_br',
      accent: 'violet',
      linkedTo: 'n1_br_sw',
      points: [
        { x: 456, y: 372 },
        { x: 456, y: 392 },
        { x: 478, y: 392 },
        { x: 478, y: 378 },
      ],
    },
  ],
  cues: [
    { x: 66, y: 294, text: 'LAUNCH ↑', accent: 'mint' },
    { x: 186, y: 170, text: '3.2s LASER + CRUMBLE', accent: 'amber' },
    { x: 500, y: 344, text: '3.2s BRIDGE → A+B', accent: 'violet' },
  ],
};

/**
 * Nightmare Stage N2: Counterweight (Nightmare ★★★★★)
 * Dual Crate Alchemy: drop x1 Crate to power Open-Shaft Lift, push Heavy x2 Crate together, kill Pit Laser, climb for Key.
 */
export const LEVEL_NIGHTMARE_N2: LevelDefinition = {
  id: 'stage-n2',
  code: 'N2',
  tier: 'nightmare',
  difficulty: 5,
  order: 10,
  name: 'STAGE N2',
  title: 'Counterweight',
  subtitle: 'Weigh the cargo lift with x1, ride up to push heavy x2 together, disable the laser & claim the key.',
  mechanicTag: 'NIGHTMARE · MASS',
  themeAccent: '#C084FC',
  parTimeMs: {
    gold: 58_000,
    silver: 100_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 26,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West Foundry Floor (24..368)
    { x: 24, y: 384, w: 344, h: 64 },
    // Upper x1 Crate Shelf (226..358, y=254 -> clear sky above n2_pad1 at 192..224!)
    { x: 226, y: 254, w: 132, h: 14 },
    // Mid Checkpoint Island (438..522, y=372)
    { x: 438, y: 372, w: 84, h: 76 },
    // Upper Heavy x2 Mezzanine (436..640, y=238 -> clear shaft above n2_lift at 374..430!)
    { x: 436, y: 238, w: 204, h: 16 },
    // Crate stopper lip on right end of Heavy Deck
    { x: 626, y: 222, w: 14, h: 16 },
    // East Sanctuary (634..776, y=372)
    { x: 634, y: 372, w: 142, h: 76 },
    // Bulkhead above gate_n2
    { x: 672, y: 24, w: 16, h: 276 },
  ],
  oneWayPlatforms: [{ x: 72, y: 254, w: 108, h: 10 }],
  hazards: [
    { x: 368, y: 422, w: 70, h: 26 },
    // 112 px chasm -> strictly impassable without n2_bridge!
    { x: 522, y: 422, w: 112, h: 26 },
  ],
  bouncePads: [{ id: 'n2_pad1', x: 192, y: 374, w: 32, h: 10, accent: 'mint' }],
  lasers: [
    {
      id: 'n2_laser',
      x: 600,
      y: 254,
      w: 8,
      h: 118,
      disabledBySwitchId: 'n2_bridge_sw',
    },
  ],
  checkpoints: [
    {
      id: 'cp_n2',
      x: 450,
      y: 336,
      w: 18,
      h: 36,
      spawnX: 450,
      spawnFloorY: 372,
    },
  ],
  switches: [
    {
      id: 'n2_lift_sw',
      label: 'LIFT',
      kind: 'hold',
      accent: 'amber',
      allowsCrate: true,
      x: 240,
      y: 376,
      w: 44,
      h: 8,
    },
    {
      id: 'n2_bridge_sw',
      label: 'BRIDGE+LASER',
      kind: 'latch',
      accent: 'violet',
      allowsCrate: true,
      x: 562,
      y: 230,
      w: 44,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'n2_bridge',
      x: 522,
      y: 372,
      w: 112,
      h: 14,
      poweredBySwitchId: 'n2_bridge_sw',
      latchedBySwitchId: 'n2_bridge_sw',
    },
  ],
  movingPlatforms: [
    {
      id: 'n2_lift',
      startX: 374,
      startY: 372,
      endX: 374,
      endY: 238,
      w: 56,
      h: 14,
      cycleSeconds: 3.4,
      phaseOffset: 0,
      poweredBySwitchId: 'n2_lift_sw',
      accent: 'mint',
    },
  ],
  crates: [
    {
      id: 'n2_crate1',
      x: 244,
      y: 226,
      w: 28,
      h: 28,
      requiredPushers: 1,
      accent: 'amber',
    },
    {
      id: 'n2_crate2',
      x: 454,
      y: 204,
      w: 34,
      h: 34,
      requiredPushers: 2,
      accent: 'violet',
    },
  ],
  keys: [
    {
      id: 'key_n2',
      x: 584,
      y: 110,
      unlocksGateId: 'gate_n2',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 'n2_coin1', x: 116, y: 206 },
    { id: 'n2_coin2', x: 402, y: 196 },
    { id: 'n2_coin3', x: 558, y: 326 },
  ],
  lockedGates: [
    {
      id: 'gate_n2',
      label: 'WEIGHT',
      accent: 'violet',
      x: 672,
      y: 300,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 720, y: 324, w: 42, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_n2_lf',
      accent: 'amber',
      linkedTo: 'n2_lift_sw',
      points: [
        { x: 262, y: 384 },
        { x: 262, y: 404 },
        { x: 374, y: 404 },
        { x: 374, y: 378 },
      ],
    },
    {
      id: 'wire_n2_br',
      accent: 'violet',
      linkedTo: 'n2_bridge_sw',
      points: [
        { x: 584, y: 238 },
        { x: 584, y: 342 },
        { x: 522, y: 342 },
        { x: 522, y: 376 },
      ],
    },
  ],
  cues: [
    { x: 256, y: 206, text: 'DROP x1 TO LIFT', accent: 'amber' },
    { x: 530, y: 186, text: 'PUSH x2 + CLIMB KEY', accent: 'violet' },
  ],
};

/**
 * Nightmare Stage N3: Crosswind (Nightmare ★★★★★)
 * Staggered Fast Ferries, 2P Laser Sync Switch, Open-Sky Key Bounce, and Rapid 32-tick Crumble Run.
 */
export const LEVEL_NIGHTMARE_N3: LevelDefinition = {
  id: 'stage-n3',
  code: 'N3',
  tier: 'nightmare',
  difficulty: 5,
  order: 11,
  name: 'STAGE N3',
  title: 'Crosswind',
  subtitle: 'Chain staggered ferries, trigger 2P laser sync, bounce for the key, and dash the 32-tick crumble run.',
  mechanicTag: 'NIGHTMARE · TEMPO',
  themeAccent: '#FB923C',
  parTimeMs: {
    gold: 60_000,
    silver: 105_000,
  },
  width: 800,
  height: 448,
  spawnOriginX: 26,
  spawnFloorY: 384,
  solids: [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    // West spawn deck (24..192)
    { x: 24, y: 384, w: 168, h: 64 },
    // Central Anchor (400..512, y=372)
    { x: 400, y: 372, w: 112, h: 76 },
    // Upper Key Sanctuary (312..448, y=234 -> clear sky above n3_pad at 462..496!)
    { x: 312, y: 234, w: 136, h: 14 },
    // East Sanctuary (664..776, y=372)
    { x: 664, y: 372, w: 112, h: 76 },
    // Bulkhead above n3_laser (666, 24..256) and gate_n3 (698, 24..300)
    { x: 664, y: 24, w: 14, h: 232 },
    { x: 698, y: 24, w: 16, h: 276 },
  ],
  hazards: [
    { x: 192, y: 422, w: 208, h: 26 },
    { x: 512, y: 422, w: 152, h: 26 },
  ],
  bouncePads: [{ id: 'n3_pad', x: 462, y: 362, w: 34, h: 10, accent: 'mint' }],
  crumblePlatforms: [
    { id: 'n3_c1', x: 524, y: 372, w: 36, h: 12, delayTicks: 32, respawnTicks: 108 },
    { id: 'n3_c2', x: 568, y: 372, w: 36, h: 12, delayTicks: 32, respawnTicks: 108 },
    { id: 'n3_c3', x: 612, y: 372, w: 36, h: 12, delayTicks: 32, respawnTicks: 108 },
  ],
  lasers: [
    {
      id: 'n3_laser',
      x: 667,
      y: 256,
      w: 8,
      h: 116,
      disabledBySwitchId: 'n3_coop_sw',
    },
  ],
  checkpoints: [
    {
      id: 'cp_n3',
      x: 406,
      y: 336,
      w: 18,
      h: 36,
      spawnX: 406,
      spawnFloorY: 372,
    },
  ],
  switches: [
    {
      id: 'n3_coop_sw',
      label: '2P SYNC',
      kind: 'latch',
      accent: 'mint',
      requiredPlayers: 2,
      x: 424,
      y: 364,
      w: 36,
      h: 8,
    },
  ],
  bridges: [],
  movingPlatforms: [
    {
      id: 'n3_f1',
      startX: 198,
      startY: 382,
      endX: 252,
      endY: 356,
      w: 50,
      h: 12,
      cycleSeconds: 2.6,
      phaseOffset: 0,
      accent: 'sky',
    },
    {
      id: 'n3_f2',
      startX: 294,
      startY: 356,
      endX: 344,
      endY: 376,
      w: 50,
      h: 12,
      cycleSeconds: 2.6,
      phaseOffset: 0.5,
      accent: 'violet',
    },
  ],
  crates: [],
  keys: [
    {
      id: 'key_n3',
      x: 328,
      y: 200,
      unlocksGateId: 'gate_n3',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 'n3_coin1', x: 276, y: 304 },
    { id: 'n3_coin2', x: 360, y: 184 },
    { id: 'n3_coin3', x: 586, y: 322 },
  ],
  lockedGates: [
    {
      id: 'gate_n3',
      label: 'KEY',
      accent: 'amber',
      x: 698,
      y: 300,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 726, y: 324, w: 42, h: 48 },
  requiresVaultSwitches: false,
  wires: [
    {
      id: 'wire_n3_coop',
      accent: 'mint',
      linkedTo: 'n3_coop_sw',
      points: [
        { x: 442, y: 372 },
        { x: 442, y: 396 },
        { x: 671, y: 396 },
        { x: 671, y: 372 },
      ],
    },
  ],
  cues: [
    { x: 272, y: 334, text: 'CROSS FERRIES →', accent: 'mint' },
    { x: 432, y: 332, text: '2P KILL LASER', accent: 'mint', hideWhenSwitchLatched: 'n3_coop_sw' },
    { x: 564, y: 346, text: 'FAST CRUMBLE', accent: 'amber' },
  ],
};

/**
 * Nightmare Stage N4: Obsidian Heart (True Finale ★★★★★)
 * Master Gauntlet: Head-Stack 88px Shelf, Fast Powered Ferry, Open-Sky Bounce, Heavy x2 Key, Bridge+Laser Latch, Twin Crumble & Dual Vault Exit.
 */
export const LEVEL_NIGHTMARE_N4: LevelDefinition = {
  id: 'stage-n4',
  code: 'N4',
  tier: 'nightmare',
  difficulty: 5,
  order: 12,
  name: 'STAGE N4',
  title: 'Obsidian Heart',
  subtitle: 'True finale: head-stack 88px, ride fast ferry, climb heavy x2 for key, sprint twin crumbles & lock A+B.',
  mechanicTag: 'NIGHTMARE · OBSIDIAN',
  themeAccent: '#EC4899',
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
    // West Deck (24..194)
    { x: 24, y: 384, w: 170, h: 64 },
    // 88 px High Stack Vault (96..180, y=296 -> requires head-stacking!)
    { x: 96, y: 296, w: 84, h: 14 },
    // Central Reactor Core (340..462, y=368)
    { x: 340, y: 368, w: 122, h: 80 },
    // Upper Reactor Deck (392..588, y=234 -> clear sky above n4_pad at 348..380!)
    { x: 392, y: 234, w: 196, h: 16 },
    // Crate stopper lip on right end
    { x: 574, y: 218, w: 14, h: 16 },
    // East Obsidian Summit (658..776, y=368)
    { x: 658, y: 368, w: 118, h: 80 },
    // Bulkhead above gate_n4
    { x: 672, y: 24, w: 16, h: 272 },
  ],
  hazards: [
    { x: 194, y: 422, w: 146, h: 26 },
    { x: 462, y: 422, w: 196, h: 26 },
  ],
  bouncePads: [{ id: 'n4_pad', x: 348, y: 358, w: 32, h: 10, accent: 'mint' }],
  crumblePlatforms: [
    { id: 'n4_c1', x: 562, y: 368, w: 38, h: 12, delayTicks: 34, respawnTicks: 110 },
    { id: 'n4_c2', x: 614, y: 368, w: 32, h: 12, delayTicks: 34, respawnTicks: 110 },
  ],
  lasers: [
    {
      id: 'n4_laser',
      x: 452,
      y: 250,
      w: 8,
      h: 118,
      disabledBySwitchId: 'n4_power_sw',
    },
  ],
  checkpoints: [
    {
      id: 'cp_n4',
      x: 396,
      y: 332,
      w: 18,
      h: 36,
      spawnX: 396,
      spawnFloorY: 368,
    },
  ],
  switches: [
    {
      id: 'n4_ferry_sw',
      label: 'FERRY',
      kind: 'latch',
      accent: 'mint',
      x: 118,
      y: 288,
      w: 38,
      h: 8,
    },
    {
      id: 'n4_power_sw',
      label: 'BRIDGE+LASER',
      kind: 'latch',
      accent: 'violet',
      allowsCrate: true,
      x: 514,
      y: 226,
      w: 46,
      h: 8,
    },
    {
      id: 'vault_n4a',
      label: 'A',
      kind: 'vault',
      accent: 'violet',
      x: 690,
      y: 360,
      w: 18,
      h: 8,
    },
    {
      id: 'vault_n4b',
      label: 'B',
      kind: 'vault',
      accent: 'mint',
      x: 712,
      y: 360,
      w: 18,
      h: 8,
    },
  ],
  bridges: [
    {
      id: 'n4_bridge',
      x: 462,
      y: 368,
      w: 84,
      h: 14,
      poweredBySwitchId: 'n4_power_sw',
      latchedBySwitchId: 'n4_power_sw',
    },
  ],
  movingPlatforms: [
    {
      id: 'n4_ferry',
      startX: 198,
      startY: 374,
      endX: 280,
      endY: 368,
      w: 52,
      h: 14,
      cycleSeconds: 2.8,
      phaseOffset: 0,
      poweredBySwitchId: 'n4_ferry_sw',
      accent: 'sky',
    },
  ],
  crates: [
    {
      id: 'n4_heavy',
      x: 408,
      y: 200,
      w: 34,
      h: 34,
      requiredPushers: 2,
      accent: 'violet',
    },
  ],
  keys: [
    {
      id: 'key_n4',
      x: 536,
      y: 110,
      unlocksGateId: 'gate_n4',
      accent: 'gold',
    },
  ],
  coins: [
    { id: 'n4_coin1', x: 118, y: 246 },
    { id: 'n4_coin2', x: 416, y: 184 },
    { id: 'n4_coin3', x: 596, y: 316 },
  ],
  lockedGates: [
    {
      id: 'gate_n4',
      label: 'HEART',
      accent: 'violet',
      x: 672,
      y: 296,
      w: 16,
      h: 72,
    },
  ],
  exitDoor: { x: 734, y: 320, w: 40, h: 48 },
  requiresVaultSwitches: true,
  wires: [
    {
      id: 'wire_n4_f',
      accent: 'mint',
      linkedTo: 'n4_ferry_sw',
      points: [
        { x: 137, y: 296 },
        { x: 137, y: 354 },
        { x: 194, y: 354 },
      ],
    },
    {
      id: 'wire_n4_pw',
      accent: 'violet',
      linkedTo: 'n4_power_sw',
      points: [
        { x: 537, y: 234 },
        { x: 537, y: 288 },
        { x: 456, y: 288 },
      ],
    },
  ],
  cues: [
    { x: 84, y: 344, text: 'STACK ↑', accent: 'mint', hideWhenSwitchLatched: 'n4_ferry_sw' },
    { x: 486, y: 180, text: 'PUSH x2 + KEY', accent: 'violet' },
    { x: 572, y: 344, text: 'CRUMBLE → A+B', accent: 'amber' },
  ],
};

export const NIGHTMARE_LEVELS: readonly LevelDefinition[] = [
  LEVEL_NIGHTMARE_N1,
  LEVEL_NIGHTMARE_N2,
  LEVEL_NIGHTMARE_N3,
  LEVEL_NIGHTMARE_N4,
];
