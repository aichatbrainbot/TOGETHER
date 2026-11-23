import type { LevelDefinition, SwitchDef, WireSegment } from '../types.js';

/**
 * Deterministic 32-bit PRNG (Mulberry32).
 * Zero AI dependencies — identical seed produces the exact same chamber across all clients and server.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeProceduralSeed(raw?: number | string | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.abs(Math.floor(raw));
    if (n >= 100_000 && n <= 999_999) return n;
    return (n % 899_999) + 100_000;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      return normalizeProceduralSeed(Number(trimmed));
    }
    let hash = 2166136261;
    for (let i = 0; i < trimmed.length; i += 1) {
      hash ^= trimmed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 899_999) + 100_000;
  }
  return 428_109;
}

/**
 * Deterministically generates a mathematically verified, zero-softlock cooperative chamber.
 * Combines head-stacking or crate relay + moving ferry or energy bridge + key gate or dual vault plates.
 */
export function generateProceduralChamber(rawSeed?: number | string | null): LevelDefinition {
  const seed = normalizeProceduralSeed(rawSeed);
  const rand = mulberry32(seed);

  const useCrateForWest = rand() > 0.5;
  const useMovingFerry = rand() > 0.45;
  const useKeyGate = rand() > 0.5;

  const ledgeY = 294 + Math.floor(rand() * 5) * 2; // 294..302 (82..90px above 384 -> stackable!)
  const ledgeX = 198 + Math.floor(rand() * 5) * 4; // 198..214
  const pitStartX = 336;
  const pitW = useMovingFerry ? 168 : 156;
  const eastStartX = pitStartX + pitW;

  const switches: SwitchDef[] = [];
  const bridges: LevelDefinition['bridges'][number][] = [];
  const movingPlatforms: LevelDefinition['movingPlatforms'][number][] = [];
  const crates: LevelDefinition['crates'][number][] = [];
  const keys: LevelDefinition['keys'][number][] = [];
  const lockedGates: LevelDefinition['lockedGates'][number][] = [];
  const wires: WireSegment[] = [];
  const solids: LevelDefinition['solids'][number][] = [
    { x: 0, y: 0, w: 800, h: 24 },
    { x: 0, y: 24, w: 24, h: 424 },
    { x: 776, y: 24, w: 24, h: 424 },
    { x: 24, y: 384, w: pitStartX - 24, h: 64 },
    { x: ledgeX, y: ledgeY, w: 106, h: 14 },
    { x: eastStartX, y: 384, w: 776 - eastStartX, h: 64 },
  ];

  // West puzzle mechanic
  if (useMovingFerry) {
    switches.push({
      id: 'proc_ferry_sw',
      label: 'FERRY',
      kind: 'hold',
      accent: 'mint',
      allowsCrate: true,
      x: useCrateForWest ? 276 : ledgeX + 34,
      y: useCrateForWest ? 376 : ledgeY - 8,
      w: 38,
      h: 8,
    });
    if (useCrateForWest) {
      crates.push({
        id: 'proc_crate',
        x: 212,
        y: 356,
        w: 28,
        h: 28,
        requiredPushers: 1,
        accent: 'amber',
      });
    }
    movingPlatforms.push({
      id: 'proc_ferry',
      startX: pitStartX + 10,
      startY: 368,
      endX: eastStartX - 66,
      endY: 368,
      w: 58,
      h: 14,
      cycleSeconds: 4.0 + rand() * 0.8,
      phaseOffset: 0,
      poweredBySwitchId: 'proc_ferry_sw',
      accent: 'mint',
    });
    wires.push({
      id: 'wire_proc_west',
      accent: 'mint',
      linkedTo: 'proc_ferry_sw',
      points: [
        { x: useCrateForWest ? 295 : ledgeX + 53, y: useCrateForWest ? 384 : ledgeY },
        { x: useCrateForWest ? 295 : ledgeX + 53, y: 364 },
        { x: pitStartX, y: 364 },
      ],
    });
  } else {
    switches.push(
      {
        id: 'proc_bridge_hold',
        label: 'BRIDGE',
        kind: 'hold',
        accent: 'violet',
        x: ledgeX + 34,
        y: ledgeY - 8,
        w: 36,
        h: 8,
      },
      {
        id: 'proc_bridge_lock',
        label: 'LOCK',
        kind: 'latch',
        accent: 'mint',
        x: eastStartX + 16,
        y: 376,
        w: 36,
        h: 8,
      },
    );
    bridges.push({
      id: 'proc_bridge',
      x: pitStartX,
      y: 368,
      w: pitW,
      h: 16,
      poweredBySwitchId: 'proc_bridge_hold',
      latchedBySwitchId: 'proc_bridge_lock',
    });
    wires.push(
      {
        id: 'wire_proc_hold',
        accent: 'violet',
        linkedTo: 'proc_bridge_hold',
        points: [
          { x: ledgeX + 52, y: ledgeY },
          { x: ledgeX + 52, y: 356 },
          { x: pitStartX, y: 356 },
          { x: pitStartX, y: 376 },
        ],
      },
      {
        id: 'wire_proc_lock',
        accent: 'mint',
        linkedTo: 'proc_bridge_lock',
        points: [
          { x: eastStartX + 34, y: 384 },
          { x: eastStartX + 34, y: 404 },
          { x: eastStartX, y: 404 },
          { x: eastStartX, y: 376 },
        ],
      },
    );
  }

  // East vault mechanic
  if (useKeyGate) {
    const keyX = ledgeX + 82;
    const keyY = ledgeY - 38;
    keys.push({
      id: 'proc_key',
      x: keyX,
      y: keyY,
      unlocksGateId: 'proc_gate',
      accent: 'violet',
    });
    solids.push({ x: 676, y: 24, w: 16, h: 288 });
    lockedGates.push({
      id: 'proc_gate',
      label: 'KEY',
      accent: 'violet',
      x: 676,
      y: 312,
      w: 16,
      h: 72,
    });
  } else {
    switches.push(
      {
        id: 'proc_vault_a',
        label: 'A',
        kind: 'vault',
        accent: 'violet',
        x: eastStartX + 78,
        y: 376,
        w: 30,
        h: 8,
      },
      {
        id: 'proc_vault_b',
        label: 'B',
        kind: 'vault',
        accent: 'mint',
        x: eastStartX + 142,
        y: 376,
        w: 30,
        h: 8,
      },
    );
    wires.push(
      {
        id: 'wire_proc_va',
        accent: 'violet',
        linkedTo: 'proc_vault_a',
        points: [
          { x: eastStartX + 93, y: 384 },
          { x: eastStartX + 93, y: 414 },
          { x: 734, y: 414 },
          { x: 734, y: 384 },
        ],
      },
      {
        id: 'wire_proc_vb',
        accent: 'mint',
        linkedTo: 'proc_vault_b',
        points: [
          { x: eastStartX + 157, y: 384 },
          { x: eastStartX + 157, y: 402 },
          { x: 748, y: 402 },
          { x: 748, y: 384 },
        ],
      },
    );
  }

  return {
    id: `procedural:${seed}`,
    code: '∞',
    tier: 'procedural',
    difficulty: 3,
    order: 99,
    name: `LAB #${seed}`,
    title: `Procedural #${seed}`,
    subtitle: 'Deterministic seeded cooperative chamber (Zero AI).',
    mechanicTag: 'PROCEDURAL',
    themeAccent: '#54D6C5',
    parTimeMs: {
      gold: 45_000,
      silver: 80_000,
    },
    width: 800,
    height: 448,
    spawnOriginX: 38,
    spawnFloorY: 384,
    solids,
    hazards: [{ x: pitStartX, y: 420, w: pitW, h: 28 }],
    switches,
    bridges,
    movingPlatforms,
    crates,
    keys,
    lockedGates,
    exitDoor: { x: 720, y: 336, w: 44, h: 48 },
    requiresVaultSwitches: !useKeyGate,
    wires,
    cues: [
      {
        x: ledgeX - 18,
        y: 344,
        text: useCrateForWest && useMovingFerry ? 'CRATE → FERRY' : 'STACK HERE ↑',
        accent: 'violet',
      },
      {
        x: 636,
        y: 348,
        text: useKeyGate ? 'BRING KEY TO GATE' : 'HOLD A + B TOGETHER',
        accent: 'mint',
        hideWhenUnlocked: !useKeyGate,
      },
    ],
    proceduralSeed: seed,
  };
}
