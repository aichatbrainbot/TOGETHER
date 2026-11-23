import { PHYSICS, type LevelDefinition, type MedalTier } from '../types.js';
import { LEVEL_CHAMBER_01 } from './chamber01.js';
import { LEVEL_CHAMBER_02 } from './chamber02.js';
import { LEVEL_CHAMBER_03 } from './chamber03.js';
import { LEVEL_CHAMBER_04 } from './chamber04.js';
import { generateProceduralChamber, normalizeProceduralSeed } from './procedural.js';
import {
  LEVEL_NIGHTMARE_N1,
  LEVEL_NIGHTMARE_N2,
  LEVEL_NIGHTMARE_N3,
  LEVEL_NIGHTMARE_N4,
  NIGHTMARE_LEVELS,
} from './nightmareStages.js';
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
export {
  LEVEL_NIGHTMARE_N1,
  LEVEL_NIGHTMARE_N2,
  LEVEL_NIGHTMARE_N3,
  LEVEL_NIGHTMARE_N4,
  NIGHTMARE_LEVELS,
} from './nightmareStages.js';
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
  ...NIGHTMARE_LEVELS,
];

export interface LevelUnlockStatus {
  readonly unlocked: boolean;
  readonly requirementText: string;
}

/**
 * Campaign lock rules:
 * - Page 1 (Standard 1–4): Open to all squads.
 * - Page 2 (Special S1–S4) & Procedural Lab: Locked until all 4 Standard stages (1–4) are cleared Ranked;
 *   S2/S3/S4 then unlock strictly in sequential order.
 * - Page 3 (Nightmare N1–N4): Locked until S1–S4 are all cleared Ranked; unlocks strictly N1 -> N2 -> N3 -> N4.
 */
export function getLevelUnlockStatus(
  levelId: string,
  clearedLevelIds: ReadonlySet<string>,
): LevelUnlockStatus {
  const normalDone = NORMAL_LEVELS.every((lvl) => clearedLevelIds.has(lvl.id));

  if (NORMAL_LEVELS.some((lvl) => lvl.id === levelId)) {
    return { unlocked: true, requirementText: '' };
  }

  if (levelId.startsWith('procedural')) {
    return normalDone
      ? { unlocked: true, requirementText: '' }
      : { unlocked: false, requirementText: 'Clear Stages 1–4 (Ranked) to unlock' };
  }

  const specialIdx = SPECIAL_LEVELS.findIndex((lvl) => lvl.id === levelId);
  if (specialIdx >= 0) {
    if (!normalDone) {
      return { unlocked: false, requirementText: 'Clear Stages 1–4 (Ranked) to unlock' };
    }
    for (let i = 0; i < specialIdx; i += 1) {
      const prev = SPECIAL_LEVELS[i]!;
      if (!clearedLevelIds.has(prev.id)) {
        return {
          unlocked: false,
          requirementText: `Clear Stage ${prev.code} (Ranked) to unlock`,
        };
      }
    }
    return { unlocked: true, requirementText: '' };
  }

  const nightmareIdx = NIGHTMARE_LEVELS.findIndex((lvl) => lvl.id === levelId);
  if (nightmareIdx >= 0) {
    if (!normalDone) {
      return { unlocked: false, requirementText: 'Clear Stages 1–4 (Ranked) first' };
    }
    for (const sp of SPECIAL_LEVELS) {
      if (!clearedLevelIds.has(sp.id)) {
        return {
          unlocked: false,
          requirementText: `Clear Special Stages S1–S4 (Ranked) to unlock`,
        };
      }
    }
    for (let i = 0; i < nightmareIdx; i += 1) {
      const prev = NIGHTMARE_LEVELS[i]!;
      if (!clearedLevelIds.has(prev.id)) {
        return {
          unlocked: false,
          requirementText: `Clear Stage ${prev.code} (Ranked) to unlock`,
        };
      }
    }
    return { unlocked: true, requirementText: '' };
  }

  return { unlocked: true, requirementText: '' };
}

export function getUnlockedLevelIds(clearedLevelIds: ReadonlySet<string>): string[] {
  const unlocked = CAMPAIGN_LEVELS.filter(
    (lvl) => getLevelUnlockStatus(lvl.id, clearedLevelIds).unlocked,
  ).map((lvl) => lvl.id);
  if (getLevelUnlockStatus('procedural:428109', clearedLevelIds).unlocked) {
    unlocked.push('procedural');
  }
  return unlocked;
}

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
