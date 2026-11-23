import {
  ACTIVITY_LIMITS,
  type ActivityPlayer,
  type ActivityRoomState,
  type ChallengeModifier,
  type EmotePingId,
  type GameWorldState,
  type LevelDefinition,
  PHYSICS,
  type PlayerTickInput,
  type RoomUpdateReason,
  type S2CMessage,
  SOLO_PUPPET_ID,
  type SessionClearSummary,
  type SimEvent,
  createGameWorld,
  createPlayerEntity,
  getPaletteForSlot,
  normalizeProceduralSeed,
  resolveLevel,
  sanitizeDisplayName,
  stepGameWorld,
} from '@together/game-core';
import type { WebSocket } from 'ws';
import type { VerifiedSessionUser } from '../auth/sessionToken.js';
import type { StatsStore } from '../storage/statsStore.js';

interface ManagedPlayer {
  id: string;
  username: string;
  globalName: string | null;
  displayName: string;
  avatarUrl: string | null;
  slot: number;
  color: string;
  badge: string;
  connected: boolean;
  ready: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  lastEmoteAt: number;
  socket: WebSocket | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedRoom {
  instanceId: string;
  channelId: string | null;
  guildId: string | null;
  phase: 'lobby' | 'playing';
  hostId: string | null;
  selectedLevelId: string;
  selectedSeed: number | null;
  modifier: ChallengeModifier;
  activeLevel: LevelDefinition | null;
  createdAt: number;
  players: Map<string, ManagedPlayer>;
  sessionClears: SessionClearSummary[];
  world: GameWorldState | null;
  inputs: Map<string, PlayerTickInput>;
  pendingEvents: SimEvent[];
  simTimer: ReturnType<typeof setInterval> | null;
  lastStepTimeMs: number;
  accumulatorMs: number;
}

interface SocketBinding {
  instanceId: string;
  playerId: string;
}

export interface JoinResult {
  ok: true;
  playerId: string;
  reconnected: boolean;
  room: ActivityRoomState;
  world: GameWorldState | null;
}

export interface JoinFailure {
  ok: false;
  code: 'ROOM_FULL';
  message: string;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; code: 'NOT_IN_ROOM' | 'NOT_HOST'; message: string };

const IMMEDIATE_EVENT_TYPES = new Set<SimEvent['type']>([
  'bounce',
  'crumble',
  'checkpoint',
  'bridge_lock',
  'key_pickup',
  'gate_unlock',
  'door_unlock',
  'respawn',
  'level_complete',
]);

export class ActivityRoomManager {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly socketBindings = new Map<WebSocket, SocketBinding>();
  private readonly disconnectGraceMs: number;
  private readonly statsStore: StatsStore | null;

  constructor(
    disconnectGraceMs: number = ACTIVITY_LIMITS.DISCONNECT_GRACE_MS,
    statsStore: StatsStore | null = null,
  ) {
    this.disconnectGraceMs = disconnectGraceMs;
    this.statsStore = statsStore;
  }

  getStats(): { activeInstances: number; activePlayers: number } {
    let activePlayers = 0;
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.connected) activePlayers += 1;
      }
    }
    return {
      activeInstances: this.rooms.size,
      activePlayers,
    };
  }

  getRoomState(instanceId: string): ActivityRoomState | null {
    const room = this.rooms.get(instanceId);
    return room ? this.serializeRoom(room) : null;
  }

  getWorldState(instanceId: string): GameWorldState | null {
    return this.rooms.get(instanceId)?.world ?? null;
  }

  getBinding(socket: WebSocket): SocketBinding | undefined {
    return this.socketBindings.get(socket);
  }

  joinInstance(params: {
    instanceId: string;
    channelId: string | null;
    guildId: string | null;
    user: VerifiedSessionUser;
    socket: WebSocket;
  }): JoinResult | JoinFailure {
    const { instanceId, channelId, guildId, user, socket } = params;
    const now = Date.now();

    if (this.socketBindings.has(socket)) {
      this.handleDisconnect(socket);
    }

    let room = this.rooms.get(instanceId);
    if (!room) {
      room = {
        instanceId,
        channelId,
        guildId,
        phase: 'lobby',
        hostId: null,
        selectedLevelId: 'chamber-01',
        selectedSeed: null,
        modifier: 'standard',
        activeLevel: null,
        createdAt: now,
        players: new Map(),
        sessionClears: [],
        world: null,
        inputs: new Map(),
        pendingEvents: [],
        simTimer: null,
        lastStepTimeMs: now,
        accumulatorMs: 0,
      };
      this.rooms.set(instanceId, room);
    } else {
      if (!room.channelId && channelId) room.channelId = channelId;
      if (!room.guildId && guildId) room.guildId = guildId;
    }

    const existing = room.players.get(user.sub);
    if (existing) {
      const wasDisconnected = !existing.connected;
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
      }

      if (existing.socket && existing.socket !== socket) {
        const oldSocket = existing.socket;
        this.socketBindings.delete(oldSocket);
        if (oldSocket.readyState === oldSocket.OPEN || oldSocket.readyState === oldSocket.CONNECTING) {
          oldSocket.close(4001, 'Session resumed on another connection');
        }
      }

      existing.username = user.username;
      existing.globalName = user.globalName;
      existing.displayName = sanitizeDisplayName(user.globalName, user.username);
      existing.avatarUrl = user.avatarUrl;
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.socket = socket;

      if (!room.hostId) {
        room.hostId = existing.id;
      }

      if (room.world) {
        const simPlayer = room.world.players.find((p) => p.id === existing.id);
        if (simPlayer) {
          simPlayer.connected = true;
          simPlayer.displayName = existing.displayName;
        }
      }

      this.socketBindings.set(socket, { instanceId, playerId: existing.id });

      const serialized = this.serializeRoom(room);
      this.broadcast(
        room,
        {
          type: 'room_state',
          reason: wasDisconnected ? 'reconnect' : 'sync',
          room: serialized,
        },
        socket,
      );

      return {
        ok: true,
        playerId: existing.id,
        reconnected: wasDisconnected,
        room: serialized,
        world: room.world,
      };
    }

    const freeSlot = this.findLowestFreeSlot(room);
    if (freeSlot === null) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: `This Activity session already has the maximum of ${ACTIVITY_LIMITS.MAX_PLAYERS} players.`,
      };
    }

    const palette = getPaletteForSlot(freeSlot);
    const player: ManagedPlayer = {
      id: user.sub,
      username: user.username,
      globalName: user.globalName,
      displayName: sanitizeDisplayName(user.globalName, user.username),
      avatarUrl: user.avatarUrl,
      slot: freeSlot,
      color: palette.color,
      badge: palette.badge,
      connected: true,
      ready: false,
      joinedAt: now,
      disconnectedAt: null,
      lastEmoteAt: 0,
      socket,
      graceTimer: null,
    };

    room.players.set(player.id, player);
    if (!room.hostId) {
      room.hostId = player.id;
    }

    if (room.world && room.phase === 'playing' && room.activeLevel) {
      if (room.world.soloPractice) {
        room.world.soloPractice = false;
        room.world.soloActiveId = null;
        room.world.players = room.world.players.filter((p) => !p.isSoloPuppet);
        room.inputs.delete(SOLO_PUPPET_ID);
      }
      room.world.players.push(
        createPlayerEntity(room.activeLevel, {
          id: player.id,
          displayName: player.displayName,
          slot: player.slot,
          connected: true,
        }),
      );
      room.world.players.sort((a, b) => a.slot - b.slot);
      if (!room.world.contributions[player.id]) {
        room.world.contributions[player.id] = {
          switchesTriggered: 0,
          keysCollected: 0,
          respawns: 0,
        };
      }
    }

    this.socketBindings.set(socket, { instanceId, playerId: player.id });

    const serialized = this.serializeRoom(room);
    this.broadcast(
      room,
      {
        type: 'room_state',
        reason: 'join',
        room: serialized,
      },
      socket,
    );

    if (room.world && room.phase === 'playing') {
      this.broadcastSnapshot(room, [], socket);
    }

    return {
      ok: true,
      playerId: player.id,
      reconnected: false,
      room: serialized,
      world: room.world,
    };
  }

  setReady(socket: WebSocket, ready: boolean): ActivityRoomState | null {
    const binding = this.socketBindings.get(socket);
    if (!binding) return null;

    const room = this.rooms.get(binding.instanceId);
    if (!room) return null;

    const player = room.players.get(binding.playerId);
    if (!player || !player.connected) return null;

    player.ready = ready;
    const serialized = this.serializeRoom(room);
    this.broadcast(room, {
      type: 'room_state',
      reason: 'ready',
      room: serialized,
    });
    return serialized;
  }

  selectLevel(
    socket: WebSocket,
    params: { levelId: string; proceduralSeed?: number | null; modifier?: ChallengeModifier },
  ): ActionResult {
    const binding = this.socketBindings.get(socket);
    if (!binding) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join an Activity instance first.' };
    }
    const room = this.rooms.get(binding.instanceId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Activity room not found.' };
    }
    if (room.hostId !== binding.playerId) {
      return { ok: false, code: 'NOT_HOST', message: 'Only the room host can select chambers.' };
    }

    const resolved = resolveLevel(params.levelId, params.proceduralSeed);
    room.selectedLevelId = resolved.id;
    room.selectedSeed = resolved.proceduralSeed ?? null;
    if (params.modifier) {
      room.modifier = params.modifier;
    }

    this.broadcast(room, {
      type: 'room_state',
      reason: 'level_selected',
      room: this.serializeRoom(room),
    });
    return { ok: true };
  }

  startGame(
    socket: WebSocket,
    options: { levelId?: string; proceduralSeed?: number | null; modifier?: ChallengeModifier } = {},
  ): ActionResult {
    const binding = this.socketBindings.get(socket);
    if (!binding) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join an Activity instance first.' };
    }
    const room = this.rooms.get(binding.instanceId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Activity room not found.' };
    }
    if (room.hostId !== binding.playerId) {
      return { ok: false, code: 'NOT_HOST', message: 'Only the room host can start the level.' };
    }

    if (options.levelId) {
      const resolved = resolveLevel(options.levelId, options.proceduralSeed);
      room.selectedLevelId = resolved.id;
      room.selectedSeed = resolved.proceduralSeed ?? null;
    }
    if (options.modifier) {
      room.modifier = options.modifier;
    }

    this.initLevelWorld(room);
    room.phase = 'playing';

    this.broadcast(room, {
      type: 'room_state',
      reason: 'game_started',
      room: this.serializeRoom(room),
    });
    this.broadcastSnapshot(room, []);
    this.startSimulationLoop(room);

    return { ok: true };
  }

  restartLevel(socket: WebSocket): ActionResult {
    const binding = this.socketBindings.get(socket);
    if (!binding) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join an Activity instance first.' };
    }
    const room = this.rooms.get(binding.instanceId);
    if (!room || room.phase !== 'playing') {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'No active level to restart.' };
    }

    this.initLevelWorld(room);
    this.broadcast(room, {
      type: 'room_state',
      reason: 'game_restarted',
      room: this.serializeRoom(room),
    });
    this.broadcastSnapshot(room, []);
    this.startSimulationLoop(room);
    return { ok: true };
  }

  returnToLobby(socket: WebSocket): ActionResult {
    const binding = this.socketBindings.get(socket);
    if (!binding) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join an Activity instance first.' };
    }
    const room = this.rooms.get(binding.instanceId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Activity room not found.' };
    }
    if (room.hostId !== binding.playerId) {
      return { ok: false, code: 'NOT_HOST', message: 'Only the room host can return to menu.' };
    }

    this.stopSimulationLoop(room);
    room.phase = 'lobby';
    room.world = null;
    room.activeLevel = null;
    room.inputs.clear();
    room.pendingEvents = [];
    for (const p of room.players.values()) {
      p.ready = false;
    }

    this.broadcast(room, {
      type: 'room_state',
      reason: 'returned_lobby',
      room: this.serializeRoom(room),
    });
    return { ok: true };
  }

  queueInput(socket: WebSocket, seq: number, buttons: number): boolean {
    const binding = this.socketBindings.get(socket);
    if (!binding) return false;
    const room = this.rooms.get(binding.instanceId);
    if (!room || room.phase !== 'playing' || !room.world) return false;

    const targetId =
      room.world.soloPractice && room.world.soloActiveId
        ? room.world.soloActiveId
        : binding.playerId;

    const prev = room.inputs.get(targetId);
    if (prev?.seq !== undefined && seq < prev.seq) {
      return true;
    }
    room.inputs.set(targetId, { buttons, seq });
    return true;
  }

  sendEmote(socket: WebSocket, emote: EmotePingId): boolean {
    const binding = this.socketBindings.get(socket);
    if (!binding) return false;
    const room = this.rooms.get(binding.instanceId);
    if (!room) return false;
    const player = room.players.get(binding.playerId);
    if (!player || !player.connected) return false;

    const now = Date.now();
    if (now - player.lastEmoteAt < 500) return false;
    player.lastEmoteAt = now;

    const targetId =
      room.world?.soloPractice && room.world.soloActiveId
        ? room.world.soloActiveId
        : binding.playerId;

    this.broadcast(room, {
      type: 'player_emote',
      playerId: targetId,
      emote,
      serverTime: now,
    });
    return true;
  }

  swapSoloPuppet(socket: WebSocket): boolean {
    const binding = this.socketBindings.get(socket);
    if (!binding) return false;
    const room = this.rooms.get(binding.instanceId);
    if (!room || room.phase !== 'playing' || !room.world || !room.world.soloPractice) return false;

    const realConnectedCount = Array.from(room.players.values()).filter((p) => p.connected).length;
    if (realConnectedCount !== 1) return false;

    const current = room.world.soloActiveId ?? binding.playerId;
    const next = current === binding.playerId ? SOLO_PUPPET_ID : binding.playerId;

    room.inputs.set(current, { buttons: 0 });
    room.inputs.set(next, { buttons: 0 });
    room.world.soloActiveId = next;
    this.broadcastSnapshot(room, []);
    return true;
  }

  handleDisconnect(socket: WebSocket): void {
    const binding = this.socketBindings.get(socket);
    if (!binding) return;
    this.socketBindings.delete(socket);

    const room = this.rooms.get(binding.instanceId);
    if (!room) return;

    const player = room.players.get(binding.playerId);
    if (!player) return;

    if (player.socket !== socket) return;

    player.socket = null;
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();
    room.inputs.delete(player.id);

    if (room.world) {
      const simPlayer = room.world.players.find((p) => p.id === player.id);
      if (simPlayer) {
        simPlayer.connected = false;
        simPlayer.vx = 0;
      }
    }

    let reason: RoomUpdateReason = 'disconnect';
    if (room.hostId === player.id) {
      const nextHost = this.pickNextHost(room);
      room.hostId = nextHost ? nextHost.id : null;
      if (nextHost) {
        reason = 'host_migrated';
      }
    }

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
    }

    player.graceTimer = setTimeout(() => {
      this.evictDisconnectedPlayer(binding.instanceId, binding.playerId);
    }, this.disconnectGraceMs);

    const serialized = this.serializeRoom(room);
    this.broadcast(room, {
      type: 'room_state',
      reason,
      room: serialized,
    });
  }

  dispose(): void {
    for (const room of this.rooms.values()) {
      this.stopSimulationLoop(room);
      for (const player of room.players.values()) {
        if (player.graceTimer) {
          clearTimeout(player.graceTimer);
          player.graceTimer = null;
        }
      }
    }
    this.rooms.clear();
    this.socketBindings.clear();
  }

  private initLevelWorld(room: ManagedRoom): void {
    const level = resolveLevel(
      room.selectedLevelId,
      room.selectedLevelId.startsWith('procedural')
        ? normalizeProceduralSeed(room.selectedSeed)
        : null,
    );
    room.activeLevel = level;
    room.selectedLevelId = level.id;
    room.selectedSeed = level.proceduralSeed ?? null;

    const orderedPlayers = Array.from(room.players.values()).sort((a, b) => a.slot - b.slot);
    const connectedCount = orderedPlayers.filter((p) => p.connected).length;
    const soloPractice = connectedCount === 1;

    room.world = createGameWorld(
      orderedPlayers.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        slot: p.slot,
        connected: p.connected,
      })),
      {
        level,
        soloPractice,
        modifier: room.modifier,
      },
    );
    room.inputs.clear();
    room.pendingEvents = [];
    room.lastStepTimeMs = performance.now();
    room.accumulatorMs = 0;
  }

  private startSimulationLoop(room: ManagedRoom): void {
    this.stopSimulationLoop(room);
    room.lastStepTimeMs = performance.now();
    room.accumulatorMs = 0;

    const stepMs = 1000 / PHYSICS.TICK_RATE;
    // 8ms polling cadence eliminates Windows 15.6ms setInterval double-tick aliasing
    room.simTimer = setInterval(() => {
      if (!room.world || !room.activeLevel || room.phase !== 'playing') {
        this.stopSimulationLoop(room);
        return;
      }

      const now = performance.now();
      const delta = Math.min(100, Math.max(0, now - room.lastStepTimeMs));
      room.lastStepTimeMs = now;
      room.accumulatorMs += delta;

      let stepsRun = 0;
      let forceBroadcast = false;
      const wasCompleted = room.world.status === 'completed';

      while (room.accumulatorMs >= stepMs && stepsRun < 4) {
        room.accumulatorMs -= stepMs;
        stepsRun += 1;

        const inputRecord: Record<string, PlayerTickInput | undefined> = {};
        for (const [id, inp] of room.inputs.entries()) {
          inputRecord[id] = inp;
        }

        const tickEvents = stepGameWorld(room.world, inputRecord, room.activeLevel);
        if (tickEvents.length > 0) {
          room.pendingEvents.push(...tickEvents);
          if (tickEvents.some((e) => IMMEDIATE_EVENT_TYPES.has(e.type))) {
            forceBroadcast = true;
          }
        }

        if (room.world.status === 'completed') {
          forceBroadcast = true;
          break;
        }
      }

      if (
        stepsRun > 0 &&
        (forceBroadcast || room.world.tick % PHYSICS.SNAPSHOT_INTERVAL_TICKS === 0)
      ) {
        const events = room.pendingEvents.splice(0);
        this.broadcastSnapshot(room, events);
      }

      if (!wasCompleted && room.world.status === 'completed') {
        this.recordCompletedRun(room);
        this.stopSimulationLoop(room);
      }
    }, 8);
  }

  private recordCompletedRun(room: ManagedRoom): void {
    const world = room.world;
    const level = room.activeLevel;
    if (!world || !level || world.completionTimeMs === null || !world.medal) return;

    const clearSummary: SessionClearSummary = {
      levelId: level.id,
      levelName: `${level.name} · ${level.title}`,
      modifier: world.modifier,
      completionTimeMs: world.completionTimeMs,
      respawnCount: world.respawnCount,
      medal: world.medal,
      clearedAt: Date.now(),
    };
    room.sessionClears.unshift(clearSummary);
    if (room.sessionClears.length > 20) {
      room.sessionClears = room.sessionClears.slice(0, 20);
    }

    if (this.statsStore) {
      const realPlayers = world.players.filter((p) => !p.isSoloPuppet);
      this.statsStore.recordClear({
        levelId: level.id,
        levelName: `${level.name} · ${level.title}`,
        modifier: world.modifier,
        completionTimeMs: world.completionTimeMs,
        respawnCount: world.respawnCount,
        medal: world.medal,
        soloPractice: world.soloPractice,
        players: realPlayers.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          contribution: world.contributions[p.id] ?? {
            switchesTriggered: 0,
            keysCollected: 0,
            respawns: 0,
          },
        })),
      });
    }

    this.broadcast(room, {
      type: 'room_state',
      reason: 'sync',
      room: this.serializeRoom(room),
    });
  }

  private stopSimulationLoop(room: ManagedRoom): void {
    if (room.simTimer) {
      clearInterval(room.simTimer);
      room.simTimer = null;
    }
  }

  private broadcastSnapshot(room: ManagedRoom, events: SimEvent[], exclude?: WebSocket): void {
    if (!room.world) return;
    this.broadcast(
      room,
      {
        type: 'game_snapshot',
        serverTime: Date.now(),
        world: room.world,
        events,
      },
      exclude,
    );
  }

  private evictDisconnectedPlayer(instanceId: string, playerId: string): void {
    const room = this.rooms.get(instanceId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player || player.connected) return;

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }

    room.players.delete(playerId);
    room.inputs.delete(playerId);

    if (room.world) {
      room.world.players = room.world.players.filter((p) => p.id !== playerId);
    }

    if (room.hostId === playerId) {
      const nextHost = this.pickNextHost(room);
      room.hostId = nextHost ? nextHost.id : null;
    }

    if (room.players.size === 0) {
      this.stopSimulationLoop(room);
      this.rooms.delete(instanceId);
      return;
    }

    const serialized = this.serializeRoom(room);
    this.broadcast(room, {
      type: 'room_state',
      reason: 'leave',
      room: serialized,
    });
  }

  private findLowestFreeSlot(room: ManagedRoom): number | null {
    const used = new Set<number>();
    for (const player of room.players.values()) {
      used.add(player.slot);
    }
    for (let slot = 0; slot < ACTIVITY_LIMITS.MAX_PLAYERS; slot += 1) {
      if (!used.has(slot)) return slot;
    }
    return null;
  }

  private pickNextHost(room: ManagedRoom): ManagedPlayer | null {
    const connected = Array.from(room.players.values())
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt || a.slot - b.slot);
    return connected[0] ?? null;
  }

  private serializeRoom(room: ManagedRoom): ActivityRoomState {
    const players: ActivityPlayer[] = Array.from(room.players.values())
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        id: p.id,
        username: p.username,
        globalName: p.globalName,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        slot: p.slot,
        color: p.color,
        badge: p.badge,
        connected: p.connected,
        ready: p.ready,
        isHost: room.hostId === p.id,
        joinedAt: p.joinedAt,
        disconnectedAt: p.disconnectedAt,
      }));

    return {
      instanceId: room.instanceId,
      channelId: room.channelId,
      guildId: room.guildId,
      phase: room.phase,
      hostId: room.hostId,
      selectedLevelId: room.selectedLevelId,
      selectedSeed: room.selectedSeed,
      modifier: room.modifier,
      minPlayers: ACTIVITY_LIMITS.MIN_PLAYERS,
      maxPlayers: ACTIVITY_LIMITS.MAX_PLAYERS,
      createdAt: room.createdAt,
      players,
      sessionClears: room.sessionClears,
    };
  }

  private broadcast(room: ManagedRoom, message: S2CMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const player of room.players.values()) {
      if (!player.socket || player.socket === exclude) continue;
      if (player.socket.readyState === player.socket.OPEN) {
        player.socket.send(payload);
      }
    }
  }
}
