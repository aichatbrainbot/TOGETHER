import {
  ACTIVITY_LIMITS,
  type ActivityRoomState,
  type C2SMessage,
  type ChallengeModifier,
  type EmotePingId,
  type GameWorldState,
  type RoomUpdateReason,
  type SimEvent,
  parseS2CMessage,
} from '@together/game-core';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface ActivitySocketCallbacks {
  onConnectionChange: (state: ConnectionState) => void;
  onRoomUpdate: (
    room: ActivityRoomState,
    reason: RoomUpdateReason | 'welcome',
    reconnected?: boolean,
  ) => void;
  onGameSnapshot: (world: GameWorldState, events: SimEvent[]) => void;
  onPlayerEmote: (playerId: string, emote: EmotePingId) => void;
  onPingUpdate: (rttMs: number) => void;
  onError: (code: string, message: string) => void;
}

export class ActivitySocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedManually = false;

  constructor(
    private readonly params: {
      wsUrl: string;
      instanceId: string;
      channelId: string | null;
      guildId: string | null;
      sessionToken: string;
    },
    private readonly callbacks: ActivitySocketCallbacks,
  ) {}

  connect(): void {
    this.closedManually = false;
    this.clearTimers();
    this.callbacks.onConnectionChange(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(this.params.wsUrl);
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.reconnectAttempt = 0;
      this.send({
        type: 'join_instance',
        instanceId: this.params.instanceId,
        channelId: this.params.channelId,
        guildId: this.params.guildId,
        sessionToken: this.params.sessionToken,
      });
      this.startHeartbeat();
    });

    ws.addEventListener('message', (event) => {
      if (this.ws !== ws) return;
      if (typeof event.data !== 'string') return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }

      // Fast hot-path for 30 Hz authoritative snapshots (avoids heavy Zod allocation 30x/sec on UI thread)
      if (
        raw &&
        typeof raw === 'object' &&
        (raw as { type?: unknown }).type === 'game_snapshot'
      ) {
        const snap = raw as { world?: GameWorldState; events?: SimEvent[] };
        if (snap.world && Array.isArray(snap.world.players)) {
          this.callbacks.onGameSnapshot(snap.world, Array.isArray(snap.events) ? snap.events : []);
        }
        return;
      }

      const msg = parseS2CMessage(raw);
      if (!msg) return;

      switch (msg.type) {
        case 'welcome':
          this.callbacks.onConnectionChange('connected');
          this.callbacks.onRoomUpdate(msg.room, 'welcome', msg.reconnected);
          if (msg.world) {
            this.callbacks.onGameSnapshot(msg.world, []);
          }
          break;
        case 'room_state':
          this.callbacks.onRoomUpdate(msg.room, msg.reason);
          break;
        case 'game_snapshot':
          this.callbacks.onGameSnapshot(msg.world, msg.events);
          break;
        case 'player_emote':
          this.callbacks.onPlayerEmote(msg.playerId, msg.emote);
          break;
        case 'pong': {
          const rtt = Math.max(0, Math.round(performance.now() - msg.clientTime));
          this.callbacks.onPingUpdate(rtt);
          break;
        }
        case 'error':
          this.callbacks.onError(msg.code, msg.message);
          if (msg.code === 'UNAUTHORIZED' || msg.code === 'ROOM_FULL') {
            this.closedManually = true;
            this.callbacks.onConnectionChange('error');
          }
          break;
      }
    });

    ws.addEventListener('close', (event) => {
      if (this.ws !== ws) return;
      this.stopHeartbeat();
      this.ws = null;

      if (this.closedManually || event.code === 4001) {
        if (event.code === 4001) {
          this.callbacks.onError('SESSION_REPLACED', 'Session was opened in another connection.');
          this.callbacks.onConnectionChange('disconnected');
        }
        return;
      }

      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // Close event handles reconnect scheduling.
    });
  }

  setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  selectLevel(params: {
    levelId: string;
    proceduralSeed?: number | null;
    modifier?: ChallengeModifier;
  }): void {
    this.send({
      type: 'select_level',
      levelId: params.levelId,
      proceduralSeed: params.proceduralSeed ?? null,
      modifier: params.modifier,
    });
  }

  startGame(options?: {
    levelId?: string;
    proceduralSeed?: number | null;
    modifier?: ChallengeModifier;
  }): void {
    this.send({
      type: 'start_game',
      levelId: options?.levelId,
      proceduralSeed: options?.proceduralSeed ?? undefined,
      modifier: options?.modifier,
    });
  }

  sendInput(seq: number, buttons: number): void {
    this.send({ type: 'input', seq, buttons });
  }

  sendEmote(emote: EmotePingId): void {
    this.send({ type: 'send_emote', emote });
  }

  swapSoloPuppet(): void {
    this.send({ type: 'swap_solo_puppet' });
  }

  restartLevel(): void {
    this.send({ type: 'restart_level' });
  }

  returnLobby(): void {
    this.send({ type: 'return_lobby' });
  }

  reconnectNow(): void {
    this.reconnectAttempt = 0;
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.close();
    }
    this.connect();
  }

  dispose(): void {
    this.closedManually = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'Activity closed');
      this.ws = null;
    }
  }

  private send(message: C2SMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.send({ type: 'ping', clientTime: performance.now() });
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', clientTime: performance.now() });
    }, ACTIVITY_LIMITS.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.callbacks.onConnectionChange('reconnecting');
    const delayMs = Math.min(8000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closedManually) {
        this.connect();
      }
    }, delayMs);
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
