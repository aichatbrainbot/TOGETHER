import { PHYSICS, type LevelDefinition, type MedalTier } from '../types.js';
import { LEVEL_CHAMBER_01 } from './chamber01.js';
import { LEVEL_CHAMBER_02 } from './chamber02.js';
import { LEVEL_CHAMBER_03 } from './chamber03.js';
import { LEVEL_CHAMBER_04 } from './chamber04.js';
import { generateProceduralChamber, normalizeProceduralSeed } from './procedural.js';
import {
  LEVEL_SPECIAL_S1,
  LEVEL_SPECIAL_S2,
  LEVEL_SPECIAL_S3,
  LEVEL_SPECIAL_S4,
} from './specialStages.js';

export { LEVEL_CHAMBER_01 } from './chamber01.js';
export { LEVEL_CHAMBER_02 } from './chamber02.js';
export { LEVEL_CHAMBER_03 } from './chamber03.js';
export { LEVEL_CHAMBER_04 } from './chamber04.js';
export {
  LEVEL_SPECIAL_S1,
  LEVEL_SPECIAL_S2,
  LEVEL_SPECIAL_S3,
  LEVEL_SPECIAL_S4,
} from './specialStages.js';
export { generateProceduralChamber, mulberry32, normalizeProceduralSeed } from './procedural.js';

export const NORMAL_LEVELS: readonly LevelDefinition[] = [
  LEVEL_CHAMBER_01,
  LEVEL_CHAMBER_02,
  LEVEL_CHAMBER_03,
  LEVEL_CHAMBER_04,
];

export const SPECIAL_LEVELS: readonly LevelDefinition[] = [
  LEVEL_SPECIAL_S1,
  LEVEL_SPECIAL_S2,
  LEVEL_SPECIAL_S3,
  LEVEL_SPECIAL_S4,
];

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  ...NORMAL_LEVELS,
  ...SPECIAL_LEVELS,
];

export function resolveLevel(levelId: string, proceduralSeed?: number | null): LevelDefinition {
  if (levelId.startsWith('procedural')) {
    const inlineSeed = levelId.includes(':') ? levelId.split(':')[1] : undefined;
    const seed = normalizeProceduralSeed(proceduralSeed ?? inlineSeed);
    return generateProceduralChamber(seed);
  }
  const found = CAMPAIGN_LEVELS.find((lvl) => lvl.id === levelId);
  return found ?? LEVEL_CHAMBER_01;
}

export function getNextLevelId(currentLevelId: string): string | null {
  const idx = CAMPAIGN_LEVELS.findIndex((lvl) => lvl.id === currentLevelId);
  if (idx >= 0 && idx + 1 < CAMPAIGN_LEVELS.length) {
    return CAMPAIGN_LEVELS[idx + 1]!.id;
  }
  return null;
}

export function getSpawnPositionForSlot(
  level: LevelDefinition,
  slot: number,
): { x: number; y: number } {
  const spacing = 18;
  const clampedSlot = Math.max(0, Math.min(7, slot));
  return {
    x: level.spawnOriginX + clampedSlot * spacing,
    y: level.spawnFloorY - PHYSICS.PLAYER_HEIGHT,
  };
}

export function computeMedal(level: LevelDefinition, completionTimeMs: number): MedalTier {
  if (completionTimeMs <= level.parTimeMs.gold) return 'gold';
  if (completionTimeMs <= level.parTimeMs.silver) return 'silver';
  return 'bronze';
}
