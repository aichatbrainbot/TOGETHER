import fs from 'node:fs';
import path from 'node:path';
import type { S2CMessage } from '@together/game-core';
import { afterEach, describe, expect, it } from 'vitest';
import { type ActivityServerInstance, createActivityServer } from '../../apps/server/src/server.js';

class TestWsClient {
  readonly ws: WebSocket;
  private readonly queue: S2CMessage[] = [];
  private readonly waiters: Array<(msg: S2CMessage) => void> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as S2CMessage;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(msg);
      } else {
        this.queue.push(msg);
      }
    });
  }

  static async connect(url: string): Promise<TestWsClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        ws.removeEventListener('open', onOpen);
        reject(new Error(`WebSocket connection failed: ${url}`));
      };
      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('error', onError, { once: true });
    });
    return new TestWsClient(ws);
  }

  send(payload: unknown): void {
    this.ws.send(JSON.stringify(payload));
  }

  nextMessage(timeoutMs = 3000): Promise<S2CMessage> {
    const existing = this.queue.shift();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(onMsg);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for WebSocket message after ${timeoutMs}ms`));
      }, timeoutMs);

      const onMsg = (msg: S2CMessage) => {
        clearTimeout(timer);
        resolve(msg);
      };

      this.waiters.push(onMsg);
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

function createMockDiscordFetch() {
  const usersByCode: Record<string, { id: string; username: string; global_name: string; avatar: string }> = {
    code_alice: { id: '100000000000000001', username: 'alice', global_name: 'Alice', avatar: 'aaa111' },
    code_bob: { id: '100000000000000002', username: 'bob', global_name: 'Bob', avatar: 'bbb222' },
    code_charlie: { id: '100000000000000003', username: 'charlie', global_name: 'Charlie', avatar: 'ccc333' },
  };
  for (let i = 1; i <= 10; i += 1) {
    usersByCode[`code_p${i}`] = {
      id: `20000000000000000${i}`.slice(0, 18),
      username: `player_${i}`,
      global_name: `Player ${i}`,
      avatar: `av_${i}`,
    };
  }

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://discord.com/api/oauth2/token') {
      const params = new URLSearchParams(String(init?.body ?? ''));
      const code = params.get('code') ?? '';
      if (!usersByCode[code]) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      return new Response(JSON.stringify({ access_token: `access_${code}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://discord.com/api/users/@me') {
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      const code = auth.replace(/^Bearer access_/, '');
      const user = usersByCode[code];
      if (!user) return new Response('unauthorized', { status: 401 });
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };

  return mockFetch;
}

describe('Discord Activity Multiplayer Server Integration', () => {
  let server: ActivityServerInstance | null = null;
  const openClients: TestWsClient[] = [];

  afterEach(async () => {
    for (const client of openClients.splice(0)) {
      await client.close();
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  async function bootServer(overrides?: { allowDevAuth?: boolean; disconnectGraceMs?: number }) {
    server = await createActivityServer({
      config: {
        port: 0,
        host: '127.0.0.1',
        discordClientId: '999999999999999999',
        discordClientSecret: 'TOP_SECRET_DO_NOT_LEAK',
        sessionSecret: 'integration-test-session-secret-0123456789',
        allowDevAuth: overrides?.allowDevAuth ?? false,
        statsFilePath: null,
        disconnectGraceMs: overrides?.disconnectGraceMs ?? 250,
      },
      fetchFn: createMockDiscordFetch(),
    });
    const { port } = await server.start();
    return {
      httpBase: `http://127.0.0.1:${port}`,
      wsProxyUrl: `ws://127.0.0.1:${port}/.proxy/ws`,
    };
  }

  async function exchangeToken(httpBase: string, code: string) {
    const res = await fetch(`${httpBase}/.proxy/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const text = await res.text();
    expect(text).not.toContain('TOP_SECRET_DO_NOT_LEAK');
    return { status: res.status, json: JSON.parse(text) as { access_token: string; sessionToken: string; user: { id: string } } };
  }

  it('syncs two Discord users in the same instanceId via /.proxy/ws and isolates other instances', async () => {
    const { httpBase, wsProxyUrl } = await bootServer();

    const healthRes = await fetch(`${httpBase}/.proxy/api/health`);
    const health = (await healthRes.json()) as { ok: boolean; discordConfigured: boolean };
    expect(health.ok).toBe(true);
    expect(health.discordConfigured).toBe(true);

    const aliceAuth = await exchangeToken(httpBase, 'code_alice');
    const bobAuth = await exchangeToken(httpBase, 'code_bob');
    const charlieAuth = await exchangeToken(httpBase, 'code_charlie');

    expect(aliceAuth.status).toBe(200);
    expect(bobAuth.status).toBe(200);

    const alice = await TestWsClient.connect(wsProxyUrl);
    const bob = await TestWsClient.connect(wsProxyUrl);
    const charlie = await TestWsClient.connect(wsProxyUrl);
    openClients.push(alice, bob, charlie);

    // Alice joins instance A
    alice.send({
      type: 'join_instance',
      instanceId: 'discord-inst-shared-1',
      channelId: 'ch-1',
      guildId: 'guild-1',
      sessionToken: aliceAuth.json.sessionToken,
    });
    const aliceWelcome = await alice.nextMessage();
    expect(aliceWelcome.type).toBe('welcome');
    if (aliceWelcome.type === 'welcome') {
      expect(aliceWelcome.reconnected).toBe(false);
      expect(aliceWelcome.room.players).toHaveLength(1);
      expect(aliceWelcome.room.players[0]?.isHost).toBe(true);
      expect(aliceWelcome.room.players[0]?.badge).toBe('P1');
    }

    // Bob joins the SAME instance A
    bob.send({
      type: 'join_instance',
      instanceId: 'discord-inst-shared-1',
      channelId: 'ch-1',
      guildId: 'guild-1',
      sessionToken: bobAuth.json.sessionToken,
    });
    const [bobWelcome, aliceJoinUpdate] = await Promise.all([bob.nextMessage(), alice.nextMessage()]);
    expect(bobWelcome.type).toBe('welcome');
    expect(aliceJoinUpdate.type).toBe('room_state');
    if (bobWelcome.type === 'welcome') {
      expect(bobWelcome.room.players).toHaveLength(2);
      expect(bobWelcome.room.players.map((p) => p.displayName)).toEqual(['Alice', 'Bob']);
      expect(bobWelcome.room.players[1]?.badge).toBe('P2');
      expect(bobWelcome.room.players[1]?.isHost).toBe(false);
    }

    // Charlie joins a DIFFERENT instance B (must remain completely isolated)
    charlie.send({
      type: 'join_instance',
      instanceId: 'discord-inst-other-2',
      sessionToken: charlieAuth.json.sessionToken,
    });
    const charlieWelcome = await charlie.nextMessage();
    expect(charlieWelcome.type).toBe('welcome');
    if (charlieWelcome.type === 'welcome') {
      expect(charlieWelcome.room.players).toHaveLength(1);
      expect(charlieWelcome.room.players[0]?.displayName).toBe('Charlie');
    }

    // Alice marks Ready -> both Alice and Bob see ready update immediately
    alice.send({ type: 'set_ready', ready: true });
    const [aliceReady, bobReady] = await Promise.all([alice.nextMessage(), bob.nextMessage()]);
    expect(aliceReady.type).toBe('room_state');
    expect(bobReady.type).toBe('room_state');
    if (bobReady.type === 'room_state') {
      expect(bobReady.reason).toBe('ready');
      expect(bobReady.room.players.find((p) => p.displayName === 'Alice')?.ready).toBe(true);
    }
  });

  it('handles disconnect grace period, host migration, reconnect recovery, and timeout eviction', async () => {
    const { httpBase, wsProxyUrl } = await bootServer({ disconnectGraceMs: 250 });

    const aliceAuth = await exchangeToken(httpBase, 'code_alice');
    const bobAuth = await exchangeToken(httpBase, 'code_bob');

    const alice = await TestWsClient.connect(wsProxyUrl);
    const bob = await TestWsClient.connect(wsProxyUrl);
    openClients.push(alice, bob);

    alice.send({
      type: 'join_instance',
      instanceId: 'inst-reconnect-test',
      sessionToken: aliceAuth.json.sessionToken,
    });
    await alice.nextMessage();

    bob.send({
      type: 'join_instance',
      instanceId: 'inst-reconnect-test',
      sessionToken: bobAuth.json.sessionToken,
    });
    await Promise.all([bob.nextMessage(), alice.nextMessage()]);

    // Alice (Host) disconnects -> Bob should become Host while Alice stays in grace slot
    await alice.close();
    const migratedMsg = await bob.nextMessage();
    expect(migratedMsg.type).toBe('room_state');
    if (migratedMsg.type === 'room_state') {
      expect(migratedMsg.reason).toBe('host_migrated');
      expect(migratedMsg.room.hostId).toBe(bobAuth.json.user.id);
      const aliceEntry = migratedMsg.room.players.find((p) => p.id === aliceAuth.json.user.id);
      expect(aliceEntry?.connected).toBe(false);
      expect(aliceEntry?.slot).toBe(0);
    }

    // Alice reconnects within grace period -> reclaims slot P1 cleanly
    const aliceReconnected = await TestWsClient.connect(wsProxyUrl);
    openClients.push(aliceReconnected);
    aliceReconnected.send({
      type: 'join_instance',
      instanceId: 'inst-reconnect-test',
      sessionToken: aliceAuth.json.sessionToken,
    });
    const [welcomeBack, bobSeesReconnect] = await Promise.all([
      aliceReconnected.nextMessage(),
      bob.nextMessage(),
    ]);
    expect(welcomeBack.type).toBe('welcome');
    if (welcomeBack.type === 'welcome') {
      expect(welcomeBack.reconnected).toBe(true);
      expect(welcomeBack.room.players.find((p) => p.id === aliceAuth.json.user.id)?.slot).toBe(0);
    }
    expect(bobSeesReconnect.type).toBe('room_state');
    if (bobSeesReconnect.type === 'room_state') {
      expect(bobSeesReconnect.reason).toBe('reconnect');
    }

    // Bob disconnects and stays gone beyond grace period -> Alice receives 'leave' eviction
    await bob.close();
    const bobOffline = await aliceReconnected.nextMessage();
    expect(bobOffline.type).toBe('room_state');
    const bobEvicted = await aliceReconnected.nextMessage(2000);
    expect(bobEvicted.type).toBe('room_state');
    if (bobEvicted.type === 'room_state') {
      expect(bobEvicted.reason).toBe('leave');
      expect(bobEvicted.room.players).toHaveLength(1);
    }
  });

  it('enforces max 8 players, rejects unauthorized tokens, and blocks dev auth when disabled', async () => {
    const { httpBase, wsProxyUrl } = await bootServer({ allowDevAuth: false });

    const devRes = await fetch(`${httpBase}/api/dev-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Hacker' }),
    });
    expect(devRes.status).toBe(403);

    // Invalid token rejected
    const badClient = await TestWsClient.connect(wsProxyUrl);
    openClients.push(badClient);
    badClient.send({
      type: 'join_instance',
      instanceId: 'inst-cap',
      sessionToken: 'invalid.token.aaaaaaaaaaaaaaaaaaaa',
    });
    const errMsg = await badClient.nextMessage();
    expect(errMsg).toMatchObject({ type: 'error', code: 'UNAUTHORIZED' });

    // Fill 8 slots
    for (let i = 1; i <= 8; i += 1) {
      const auth = await exchangeToken(httpBase, `code_p${i}`);
      const c = await TestWsClient.connect(wsProxyUrl);
      openClients.push(c);
      c.send({
        type: 'join_instance',
        instanceId: 'inst-cap',
        sessionToken: auth.json.sessionToken,
      });
      const w = await c.nextMessage();
      expect(w.type).toBe('welcome');
    }

    // 9th player gets ROOM_FULL
    const auth9 = await exchangeToken(httpBase, 'code_p9');
    const c9 = await TestWsClient.connect(wsProxyUrl);
    openClients.push(c9);
    c9.send({
      type: 'join_instance',
      instanceId: 'inst-cap',
      sessionToken: auth9.json.sessionToken,
    });
    const fullErr = await c9.nextMessage();
    expect(fullErr).toMatchObject({ type: 'error', code: 'ROOM_FULL' });
  });

  it('serves built static Activity frontend cleanly with zero DISCORD_CLIENT_SECRET leakage', async () => {
    const distDir = path.resolve(process.cwd(), 'apps/web/dist');
    expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);

    server = await createActivityServer({
      config: {
        port: 0,
        host: '127.0.0.1',
        discordClientId: '999999999999999999',
        discordClientSecret: 'TOP_SECRET_DO_NOT_LEAK',
        sessionSecret: 'integration-test-session-secret-0123456789',
        allowDevAuth: false,
        serveStaticDir: distDir,
      },
      fetchFn: createMockDiscordFetch(),
    });
    const { port } = await server.start();

    const indexRes = await fetch(`http://127.0.0.1:${port}/`);
    expect(indexRes.status).toBe(200);
    const html = await indexRes.text();
    expect(html).toContain('TOGETHER? — Discord Activity');

    const assetsDir = path.join(distDir, 'assets');
    for (const file of fs.readdirSync(assetsDir)) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
      expect(content).not.toContain('DISCORD_CLIENT_SECRET');
      expect(content).not.toContain('TOP_SECRET_DO_NOT_LEAK');
    }
  });

  it('runs 60Hz authoritative multiplayer gameplay snapshots for 2+ users and solo puppet swap', async () => {
    const { httpBase, wsProxyUrl } = await bootServer();
    const aliceAuth = await exchangeToken(httpBase, 'code_alice');
    const bobAuth = await exchangeToken(httpBase, 'code_bob');

    const alice = await TestWsClient.connect(wsProxyUrl);
    openClients.push(alice);

    alice.send({
      type: 'join_instance',
      instanceId: 'inst-gameplay-1',
      sessionToken: aliceAuth.json.sessionToken,
    });
    await alice.nextMessage();

    // Solo start spawns swappable partner puppet
    alice.send({ type: 'start_game' });

    let snap = await alice.nextMessage();
    while (snap.type !== 'game_snapshot') snap = await alice.nextMessage();
    expect(snap.world.soloPractice).toBe(true);
    expect(snap.world.players).toHaveLength(2);

    // Swap active solo puppet
    alice.send({ type: 'swap_solo_puppet' });
    let swapSnap = await alice.nextMessage();
    while (swapSnap.type !== 'game_snapshot' || swapSnap.world.soloActiveId !== '__solo_partner__') {
      swapSnap = await alice.nextMessage();
    }
    expect(swapSnap.world.soloActiveId).toBe('__solo_partner__');

    // Bob joins mid-game -> seamlessly converts Solo Practice to real 2-player co-op!
    const bob = await TestWsClient.connect(wsProxyUrl);
    openClients.push(bob);
    bob.send({
      type: 'join_instance',
      instanceId: 'inst-gameplay-1',
      sessionToken: bobAuth.json.sessionToken,
    });
    const bobWelcome = await bob.nextMessage();
    expect(bobWelcome.type).toBe('welcome');
    if (bobWelcome.type === 'welcome') {
      expect(bobWelcome.world?.soloPractice).toBe(false);
      expect(bobWelcome.world?.players.map((p) => p.displayName)).toEqual(['Alice', 'Bob']);
    }

    // Bob holds RIGHT input -> Alice receives synchronized game_snapshot showing Bob moved right!
    const bobInitialX =
      bobWelcome.type === 'welcome'
        ? (bobWelcome.world?.players.find((p) => p.displayName === 'Bob')?.x ?? 0)
        : 0;

    bob.send({ type: 'input', seq: 1, buttons: 2 }); // INPUT_BITS.RIGHT = 2

    let aliceSawBobMove = false;
    for (let i = 0; i < 20; i += 1) {
      const msg = await alice.nextMessage();
      if (msg.type === 'game_snapshot') {
        const bobEntity = msg.world.players.find((p) => p.displayName === 'Bob');
        if (bobEntity && bobEntity.x > bobInitialX + 5) {
          aliceSawBobMove = true;
          break;
        }
      }
    }
    expect(aliceSawBobMove).toBe(true);
  });
});
