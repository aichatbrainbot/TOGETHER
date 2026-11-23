import {
  ACTIVITY_LIMITS,
  type ActivityPlayer,
  type ActivityRoomState,
  type RoomUpdateReason,
  type S2CMessage,
  getPaletteForSlot,
  sanitizeDisplayName,
} from '@together/game-core';
import type { WebSocket } from 'ws';
import type { VerifiedSessionUser } from '../auth/sessionToken.js';

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
  socket: WebSocket | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedRoom {
  instanceId: string;
  channelId: string | null;
  guildId: string | null;
  phase: 'lobby' | 'playing';
  hostId: string | null;
  createdAt: number;
  players: Map<string, ManagedPlayer>;
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
}

export interface JoinFailure {
  ok: false;
  code: 'ROOM_FULL';
  message: string;
}

export class ActivityRoomManager {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly socketBindings = new Map<WebSocket, SocketBinding>();
  private readonly disconnectGraceMs: number;

  constructor(disconnectGraceMs: number = ACTIVITY_LIMITS.DISCONNECT_GRACE_MS) {
    this.disconnectGraceMs = disconnectGraceMs;
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

    // If this socket was previously bound elsewhere, clean it up first.
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
        createdAt: now,
        players: new Map(),
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

      // Close any superseded live socket cleanly without firing disconnect logic for the player.
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

      this.socketBindings.set(socket, { instanceId, playerId: existing.id });

      const serialized = this.serializeRoom(room);
      this.broadcast(room, {
        type: 'room_state',
        reason: wasDisconnected ? 'reconnect' : 'sync',
        room: serialized,
      }, socket);

      return {
        ok: true,
        playerId: existing.id,
        reconnected: wasDisconnected,
        room: serialized,
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
      socket,
      graceTimer: null,
    };

    room.players.set(player.id, player);
    if (!room.hostId) {
      room.hostId = player.id;
    }

    this.socketBindings.set(socket, { instanceId, playerId: player.id });

    const serialized = this.serializeRoom(room);
    this.broadcast(room, {
      type: 'room_state',
      reason: 'join',
      room: serialized,
    }, socket);

    return {
      ok: true,
      playerId: player.id,
      reconnected: false,
      room: serialized,
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

  handleDisconnect(socket: WebSocket): void {
    const binding = this.socketBindings.get(socket);
    if (!binding) return;
    this.socketBindings.delete(socket);

    const room = this.rooms.get(binding.instanceId);
    if (!room) return;

    const player = room.players.get(binding.playerId);
    if (!player) return;

    // Only mark disconnected if this socket is still the player's active socket.
    if (player.socket !== socket) return;

    player.socket = null;
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();

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

    if (room.hostId === playerId) {
      const nextHost = this.pickNextHost(room);
      room.hostId = nextHost ? nextHost.id : null;
    }

    if (room.players.size === 0) {
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
      minPlayers: ACTIVITY_LIMITS.MIN_PLAYERS,
      maxPlayers: ACTIVITY_LIMITS.MAX_PLAYERS,
      createdAt: room.createdAt,
      players,
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
