import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ChallengeModifier,
  LeaderboardEntry,
  MedalTier,
  PlayerContribution,
  PlayerProfileStats,
} from '@together/game-core';

export interface RecordClearInput {
  levelId: string;
  levelName: string;
  modifier: ChallengeModifier;
  completionTimeMs: number;
  respawnCount: number;
  medal: MedalTier;
  coinsCollected?: number;
  totalCoins?: number;
  soloPractice: boolean;
  players: ReadonlyArray<{
    id: string;
    displayName: string;
    contribution: PlayerContribution;
  }>;
}

export interface StatsStore {
  recordClear(input: RecordClearInput): LeaderboardEntry;
  getLeaderboard(levelId?: string, limit?: number): LeaderboardEntry[];
  getPlayerProfile(userId: string): PlayerProfileStats | null;
}

interface PersistedStatsFile {
  version: 1;
  leaderboard: LeaderboardEntry[];
  profiles: Record<string, PlayerProfileStats>;
}

const MAX_LEADERBOARD_ENTRIES = 120;
const MEDAL_RANK: Record<MedalTier, number> = { gold: 3, silver: 2, bronze: 1 };

export class JsonStatsStore implements StatsStore {
  private leaderboard: LeaderboardEntry[] = [];
  private profiles = new Map<string, PlayerProfileStats>();

  constructor(private readonly filePath: string | null) {
    if (filePath) {
      this.loadFromDisk(filePath);
    }
  }

  recordClear(input: RecordClearInput): LeaderboardEntry {
    const now = Date.now();
    const isRanked = input.modifier !== 'low_gravity';
    const coins = input.coinsCollected ?? 0;

    const entry: LeaderboardEntry = {
      id: crypto.randomUUID(),
      levelId: input.levelId,
      levelName: input.levelName,
      modifier: input.modifier,
      completionTimeMs: input.completionTimeMs,
      respawnCount: input.respawnCount,
      medal: input.medal,
      coinsCollected: coins,
      totalCoins: input.totalCoins ?? 3,
      playerCount: input.players.length,
      playerNames: input.players.map((p) => p.displayName),
      soloPractice: input.soloPractice,
      recordedAt: now,
    };

    // Unranked modifiers (e.g. Low Gravity chaos mode) never pollute ranked records or best times
    if (isRanked) {
      this.leaderboard.push(entry);
      this.leaderboard.sort(
        (a, b) =>
          a.completionTimeMs - b.completionTimeMs ||
          (b.coinsCollected ?? 0) - (a.coinsCollected ?? 0) ||
          a.respawnCount - b.respawnCount,
      );
      if (this.leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
        this.leaderboard = this.leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);
      }
    }

    for (const p of input.players) {
      const existing = this.profiles.get(p.id) ?? {
        userId: p.id,
        displayName: p.displayName,
        chambersCleared: 0,
        bestTimesByLevel: {},
        bestMedalsByLevel: {},
        bestCoinsByLevel: {},
        medals: { gold: 0, silver: 0, bronze: 0 },
        switchesTriggered: 0,
        keysCollected: 0,
        totalCoinsCollected: 0,
        totalRespawns: 0,
        lastPlayedAt: now,
      };

      existing.displayName = p.displayName;
      existing.chambersCleared += 1;
      existing.switchesTriggered += p.contribution.switchesTriggered;
      existing.keysCollected += p.contribution.keysCollected;
      existing.totalRespawns += p.contribution.respawns;
      existing.lastPlayedAt = now;

      if (isRanked) {
        existing.medals[input.medal] += 1;
        existing.totalCoinsCollected = (existing.totalCoinsCollected ?? 0) + coins;

        const prevBest = existing.bestTimesByLevel[input.levelId];
        if (prevBest === undefined || input.completionTimeMs < prevBest) {
          existing.bestTimesByLevel[input.levelId] = input.completionTimeMs;
        }

        if (!existing.bestMedalsByLevel) existing.bestMedalsByLevel = {};
        const prevMedal = existing.bestMedalsByLevel[input.levelId];
        if (!prevMedal || MEDAL_RANK[input.medal] > MEDAL_RANK[prevMedal]) {
          existing.bestMedalsByLevel[input.levelId] = input.medal;
        }

        if (!existing.bestCoinsByLevel) existing.bestCoinsByLevel = {};
        const prevCoins = existing.bestCoinsByLevel[input.levelId] ?? 0;
        if (coins > prevCoins) {
          existing.bestCoinsByLevel[input.levelId] = coins;
        }
      }

      this.profiles.set(p.id, existing);
    }

    if (this.filePath) {
      this.saveToDisk(this.filePath);
    }

    return entry;
  }

  getLeaderboard(levelId?: string, limit = 25): LeaderboardEntry[] {
    const filtered = levelId
      ? this.leaderboard.filter((e) =>
          levelId === 'procedural' ? e.levelId.startsWith('procedural:') : e.levelId === levelId,
        )
      : this.leaderboard;
    return filtered.slice(0, Math.max(1, Math.min(50, limit)));
  }

  getPlayerProfile(userId: string): PlayerProfileStats | null {
    return this.profiles.get(userId) ?? null;
  }

  private loadFromDisk(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedStatsFile>;
      if (Array.isArray(parsed.leaderboard)) {
        this.leaderboard = parsed.leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);
      }
      if (parsed.profiles && typeof parsed.profiles === 'object') {
        for (const [id, profile] of Object.entries(parsed.profiles)) {
          this.profiles.set(id, profile);
        }
      }
    } catch {
      // Corrupt or unreadable stats file starts cleanly without crashing server
    }
  }

  private saveToDisk(filePath: string): void {
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      const payload: PersistedStatsFile = {
        version: 1,
        leaderboard: this.leaderboard,
        profiles: Object.fromEntries(this.profiles.entries()),
      };
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch {
      // Non-fatal persistence failure (e.g. read-only filesystem)
    }
  }
}
