import type { LeaderboardEntry, PlayerProfileStats, S2CMessage } from '@together/game-core';
import { afterEach, describe, expect, it } from 'vitest';
import { type ActivityServerInstance, createActivityServer } from '../../apps/server/src/server.js';

class StressWsClient {
  readonly ws: WebSocket;
  readonly receivedSnapshots: number[] = [];
  readonly receivedEmotes: Array<{ playerId: string; emote: string }> = [];
  private readonly waiters: Array<(msg: S2CMessage) => void> = [];
  private readonly queue: S2CMessage[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as S2CMessage;
      if (msg.type === 'game_snapshot') {
        this.receivedSnapshots.push(msg.world.tick);
      } else if (msg.type === 'player_emote') {
        this.receivedEmotes.push({ playerId: msg.playerId, emote: msg.emote });
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter(msg);
      else this.queue.push(msg);
    });
  }

  static async connect(url: string): Promise<StressWsClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('WS open failed')), { once: true });
    });
    return new StressWsClient(ws);
  }

  send(payload: unknown): void {
    this.ws.send(JSON.stringify(payload));
  }

  nextWhere(predicate: (msg: S2CMessage) => boolean, timeoutMs = 4000): Promise<S2CMessage> {
    const idx = this.queue.findIndex(predicate);
    if (idx >= 0) {
      return Promise.resolve(this.queue.splice(idx, 1)[0]!);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for matching WS message`));
      }, timeoutMs);

      const pump = (msg: S2CMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          resolve(msg);
        } else {
          this.waiters.push(pump);
        }
      };

      this.waiters.push(pump);
    });
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.addEventListener('close', () => resolve(), { once: true });
      this.ws.close();
    });
  }
}

describe('8-Player Concurrent Stress Test & Leaderboard Persistence', () => {
  let server: ActivityServerInstance | null = null;
  const clients: StressWsClient[] = [];

  afterEach(async () => {
    for (const c of clients.splice(0)) {
      await c.close();
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('synchronizes 8 simultaneous players at 60Hz on Chamber 03 with emotes and records leaderboard + profiles', async () => {
    server = await createActivityServer({
      config: {
        port: 0,
        host: '127.0.0.1',
        discordClientId: '999999999999999999',
        discordClientSecret: 'STRESS_TEST_SECRET',
        sessionSecret: 'stress-test-session-secret-0123456789abcdef',
        allowDevAuth: true,
        statsFilePath: null,
        disconnectGraceMs: 250,
      },
    });
    const { port } = await server.start();
    const httpBase = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}/.proxy/ws`;

    // Connect 8 distinct players into the same Discord Activity instanceId
    const userIds: string[] = [];
    for (let i = 1; i <= 8; i += 1) {
      const res = await fetch(`${httpBase}/api/dev-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: `stress_u_${i}`, username: `Squad_${i}` }),
      });
      const auth = (await res.json()) as { sessionToken: string; user: { id: string } };
      userIds.push(auth.user.id);

      const client = await StressWsClient.connect(wsUrl);
      clients.push(client);
      client.send({
        type: 'join_instance',
        instanceId: 'stress-8p-instance',
        sessionToken: auth.sessionToken,
      });
      const welcome = await client.nextWhere((m) => m.type === 'welcome');
      expect(welcome.type).toBe('welcome');
    }

    // Host (client 0) selects Chamber 03 with low_gravity and starts the match
    clients[0]!.send({
      type: 'select_level',
      levelId: 'chamber-03',
      modifier: 'low_gravity',
    });
    const levelUpdate = await clients[7]!.nextWhere(
      (m) => m.type === 'room_state' && m.room.selectedLevelId === 'chamber-03',
    );
    expect(levelUpdate.type).toBe('room_state');

    clients[0]!.send({ type: 'start_game' });

    // All 8 clients stream real movement + jump inputs and player 1 sends a co-op emote ping
    await Promise.all(
      clients.map((c) => c.nextWhere((m) => m.type === 'game_snapshot')),
    );

    clients[0]!.send({ type: 'send_emote', emote: 'stack' });
    for (let step = 1; step <= 6; step += 1) {
      clients.forEach((c, idx) => {
        c.send({
          type: 'input',
          seq: step,
          buttons: idx % 2 === 0 ? 2 : 6, // RIGHT or RIGHT+JUMP
        });
      });
      await new Promise((r) => setTimeout(r, 35));
    }

    // Wait for snapshots to reach all 8 clients
    await Promise.all(
      clients.map((c) =>
        c.nextWhere((m) => m.type === 'game_snapshot' && m.world.tick >= 8 && m.world.players.length === 8),
      ),
    );

    // Every single one of the 8 clients received multiple 8-player snapshots & the emote ping
    for (const c of clients) {
      expect(c.receivedSnapshots.length).toBeGreaterThanOrEqual(4);
      expect(c.receivedEmotes.some((e) => e.emote === 'stack')).toBe(true);
    }

    // Verify statsStore + /.proxy/api/leaderboard + /.proxy/api/profile/:userId
    server.statsStore.recordClear({
      levelId: 'chamber-03',
      levelName: 'CHAMBER 03 · Leverage',
      modifier: 'low_gravity',
      completionTimeMs: 41_200,
      respawnCount: 2,
      medal: 'gold',
      soloPractice: false,
      players: userIds.map((id, i) => ({
        id,
        displayName: `Squad_${i + 1}`,
        contribution: { switchesTriggered: 1, keysCollected: i === 0 ? 1 : 0, respawns: 0 },
      })),
    });

    const lbRes = await fetch(`${httpBase}/.proxy/api/leaderboard?levelId=chamber-03`);
    const lbJson = (await lbRes.json()) as { entries: LeaderboardEntry[] };
    expect(lbJson.entries).toHaveLength(1);
    expect(lbJson.entries[0]?.playerCount).toBe(8);
    expect(lbJson.entries[0]?.medal).toBe('gold');

    const profRes = await fetch(`${httpBase}/.proxy/api/profile/stress_u_1`);
    const profJson = (await profRes.json()) as { profile: PlayerProfileStats | null };
    expect(profJson.profile?.chambersCleared).toBe(1);
    expect(profJson.profile?.medals.gold).toBe(1);
    expect(profJson.profile?.keysCollected).toBe(1);
  });
});
