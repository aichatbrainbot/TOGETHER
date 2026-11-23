import type {
  ActivityPlayer,
  ActivityRoomState,
  ChallengeModifier,
  EmotePingId,
  GameWorldState,
  SimEvent,
} from '@together/game-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameMenu } from './components/GameMenu.js';
import { GameStage } from './components/GameStage.js';
import {
  type ActivitySessionContext,
  type BootProgress,
  type DiscordUserSummary,
  bootstrapDiscordActivity,
} from './discord/activityClient.js';
import type { ActiveEmote } from './game/GameRenderer.js';
import { type GameSettings, loadGameSettings, saveGameSettings } from './game/settings.js';
import { ActivitySocketClient, type ConnectionState } from './net/ActivitySocket.js';

interface ActivityEventLogItem {
  id: number;
  text: string;
  time: string;
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function App() {
  const [bootProgress, setBootProgress] = useState<BootProgress>({
    step: 'init',
    detail: 'Booting TOGETHER? Activity...',
  });
  const [bootError, setBootError] = useState<string | null>(null);
  const [context, setContext] = useState<ActivitySessionContext | null>(null);
  const [sdkParticipants, setSdkParticipants] = useState<DiscordUserSummary[]>([]);
  const [layoutMode, setLayoutMode] = useState<number>(0);

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [room, setRoom] = useState<ActivityRoomState | null>(null);
  const [world, setWorld] = useState<GameWorldState | null>(null);
  const [latestEvents, setLatestEvents] = useState<SimEvent[]>([]);
  const [eventBatchId, setEventBatchId] = useState<number>(0);
  const [emotesByPlayerId, setEmotesByPlayerId] = useState<Map<string, ActiveEmote>>(
    () => new Map(),
  );
  const [emoteSeq, setEmoteSeq] = useState<number>(0);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<ActivityEventLogItem[]>([]);
  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());

  const socketRef = useRef<ActivitySocketClient | null>(null);
  const logSeqRef = useRef(0);

  const pushLog = useCallback((text: string) => {
    logSeqRef.current += 1;
    setEventLog((prev) => [{ id: logSeqRef.current, text, time: formatTime() }, ...prev].slice(0, 8));
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveGameSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    let sessionCtx: ActivitySessionContext | null = null;
    let unsubParticipants: (() => void) | null = null;
    let unsubLayout: (() => void) | null = null;

    bootstrapDiscordActivity((progress) => {
      if (active) setBootProgress(progress);
    })
      .then((ctx) => {
        if (!active) {
          ctx.cleanup();
          return;
        }
        sessionCtx = ctx;
        setContext(ctx);
        setSdkParticipants(ctx.initialSdkParticipants);

        unsubParticipants = ctx.onParticipantsUpdate((list) => {
          setSdkParticipants(list);
        });
        unsubLayout = ctx.onLayoutModeUpdate((mode) => {
          setLayoutMode(mode);
        });

        pushLog(
          ctx.mode === 'discord'
            ? `Discord SDK ready — authenticated as ${ctx.user.displayName}`
            : `Local preview authenticated as ${ctx.user.displayName}`,
        );

        const client = new ActivitySocketClient(
          {
            wsUrl: ctx.wsUrl,
            instanceId: ctx.instanceId,
            channelId: ctx.channelId,
            guildId: ctx.guildId,
            sessionToken: ctx.sessionToken,
          },
          {
            onConnectionChange: (state) => {
              if (!active) return;
              setConnectionState(state);
              if (state === 'reconnecting') {
                pushLog('Connection interrupted — attempting automatic reconnect...');
              }
            },
            onRoomUpdate: (nextRoom, reason, reconnected) => {
              if (!active) return;
              setRoom(nextRoom);
              setSocketError(null);
              if (nextRoom.phase === 'lobby') {
                setWorld(null);
              }
              if (reason === 'welcome') {
                pushLog(
                  reconnected
                    ? `Reconnected to shared instance (${nextRoom.players.filter((p) => p.connected).length} online)`
                    : `Joined shared Activity session (${nextRoom.players.filter((p) => p.connected).length} online)`,
                );
              } else if (reason === 'join') {
                pushLog(`A teammate joined the Activity (${nextRoom.players.filter((p) => p.connected).length} online)`);
              } else if (reason === 'reconnect') {
                pushLog('A teammate reconnected to the session');
              } else if (reason === 'disconnect') {
                pushLog('A teammate disconnected (30s reconnect grace active)');
              } else if (reason === 'host_migrated') {
                pushLog('Host disconnected — host role migrated automatically');
              } else if (reason === 'leave') {
                pushLog('A disconnected teammate left the session');
              } else if (reason === 'level_selected') {
                pushLog(`Selected ${nextRoom.selectedLevelId} (${nextRoom.modifier})`);
              } else if (reason === 'game_started') {
                pushLog(`Launched ${nextRoom.selectedLevelId}!`);
              } else if (reason === 'returned_lobby') {
                pushLog('Returned to Main Menu');
              }
            },
            onGameSnapshot: (nextWorld, events) => {
              if (!active) return;
              setWorld(nextWorld);
              if (events.length > 0) {
                setLatestEvents(events);
                setEventBatchId((n) => n + 1);
              }
            },
            onPlayerEmote: (playerId, emote) => {
              if (!active) return;
              setEmotesByPlayerId((prev) => {
                const next = new Map(prev);
                next.set(playerId, { emote, expiresAt: Date.now() + 2200 });
                return next;
              });
              setEmoteSeq((n) => n + 1);
            },
            onPingUpdate: (rtt) => {
              if (active) setPingMs(rtt);
            },
            onError: (_code, message) => {
              if (!active) return;
              setSocketError(message);
              pushLog(`Server notice: ${message}`);
            },
          },
        );

        socketRef.current = client;
        client.connect();
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unexpected Discord Activity startup error.';
        setBootError(message);
      });

    return () => {
      active = false;
      unsubParticipants?.();
      unsubLayout?.();
      socketRef.current?.dispose();
      socketRef.current = null;
      sessionCtx?.cleanup();
    };
  }, [pushLog]);

  const selfPlayer: ActivityPlayer | undefined = useMemo(() => {
    if (!room || !context) return undefined;
    return room.players.find((p) => p.id === context.user.id);
  }, [room, context]);

  const connectedPlayers = useMemo(
    () => (room ? room.players.filter((p) => p.connected) : []),
    [room],
  );

  const readyCount = useMemo(
    () => connectedPlayers.filter((p) => p.ready).length,
    [connectedPlayers],
  );

  const handleSendInput = useCallback((seq: number, buttons: number) => {
    socketRef.current?.sendInput(seq, buttons);
  }, []);

  const handleSendEmote = useCallback((emote: EmotePingId) => {
    socketRef.current?.sendEmote(emote);
  }, []);

  const handleSwapSolo = useCallback(() => {
    socketRef.current?.swapSoloPuppet();
  }, []);

  const handleRestartLevel = useCallback(() => {
    socketRef.current?.restartLevel();
  }, []);

  const handleReturnLobby = useCallback(() => {
    socketRef.current?.returnLobby();
  }, []);

  const handleToggleReady = useCallback(() => {
    if (!selfPlayer || !socketRef.current) return;
    socketRef.current.setReady(!selfPlayer.ready);
  }, [selfPlayer]);

  const handleSelectLevel = useCallback(
    (params: { levelId: string; proceduralSeed?: number | null; modifier?: ChallengeModifier }) => {
      socketRef.current?.selectLevel(params);
    },
    [],
  );

  const handleStartGame = useCallback(
    (options?: { levelId?: string; proceduralSeed?: number | null; modifier?: ChallengeModifier }) => {
      socketRef.current?.startGame(options);
    },
    [],
  );

  const handleStartNextLevel = useCallback((nextLevelId: string, proceduralSeed?: number) => {
    socketRef.current?.startGame({ levelId: nextLevelId, proceduralSeed });
  }, []);

  const handleReconnect = useCallback(() => {
    socketRef.current?.reconnectNow();
  }, []);

  // Compact Picture-in-Picture (PIP) view when minimized inside Discord
  if (layoutMode === 1 && context) {
    return (
      <main className="pip-shell">
        <div className="pip-header">
          <span className="brand-mark">TOGETHER?</span>
          <span className={`status-dot status-${connectionState}`} />
        </div>
        <div className="pip-count">
          <strong>{connectedPlayers.length}</strong>
          <span>
            {room?.phase === 'playing' ? `playing ${room.selectedLevelId}` : `/ ${room?.maxPlayers ?? 8} in menu`}
          </span>
        </div>
        <div className="pip-avatars">
          {(room?.players ?? []).slice(0, 6).map((player) => (
            <div
              key={player.id}
              className="pip-chip"
              style={{ borderColor: player.color, opacity: player.connected ? 1 : 0.45 }}
            >
              {player.badge}
            </div>
          ))}
        </div>
      </main>
    );
  }

  // Error screen
  if (bootError) {
    return (
      <main className="activity-shell centered-shell">
        <section className="panel error-panel">
          <div className="brand-row">
            <span className="brand-mark">TOGETHER?</span>
            <span className="pill pill-danger">STARTUP ERROR</span>
          </div>
          <h1 className="error-title">Activity Initialization Failed</h1>
          <p className="error-message">{bootError}</p>
          <div className="surface diagnostic-box">
            <p className="muted-label">
              Last step reached: <code>{bootProgress.step}</code>
            </p>
            <p className="muted-note">
              Verify your Discord Application ID and server OAuth2 credentials in your root{' '}
              <code>.env</code>, ensure URL Mapping <code>/</code> points to your running tunnel,
              and confirm OAuth2 Redirect URI is configured in the Discord Developer Portal.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry Launch
          </button>
        </section>
      </main>
    );
  }

  // Boot / SDK handshake screen
  if (!context) {
    return (
      <main className="activity-shell centered-shell">
        <section className="panel loading-panel">
          <div className="brand-mark brand-large">TOGETHER?</div>
          <div className="pulse-bar" aria-hidden="true" />
          <p className="loading-detail">{bootProgress.detail}</p>
          <span className="muted-label">Discord Activity Handshake</span>
        </section>
      </main>
    );
  }

  // Full-Screen Gameplay Stage (Chambers 01–03 & Procedural Labs)
  if (room?.phase === 'playing' && world) {
    return (
      <main className="game-viewport-root">
        <GameStage
          world={world}
          events={latestEvents}
          eventBatchId={eventBatchId}
          emotesByPlayerId={emotesByPlayerId}
          emoteSeq={emoteSeq}
          localUserId={context.user.id}
          isHost={Boolean(selfPlayer?.isHost)}
          pingMs={pingMs}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onSendInput={handleSendInput}
          onSendEmote={handleSendEmote}
          onSwapSolo={handleSwapSolo}
          onRestartLevel={handleRestartLevel}
          onStartNextLevel={handleStartNextLevel}
          onReturnLobby={handleReturnLobby}
        />
      </main>
    );
  }

  // Full-Screen Dark Game Main Menu
  return (
    <GameMenu
      context={context}
      room={room}
      selfPlayer={selfPlayer}
      connectedPlayers={connectedPlayers}
      readyCount={readyCount}
      sdkParticipants={sdkParticipants}
      connectionState={connectionState}
      pingMs={pingMs}
      socketError={socketError}
      eventLog={eventLog}
      settings={settings}
      onUpdateSettings={handleUpdateSettings}
      onSelectLevel={handleSelectLevel}
      onStartGame={handleStartGame}
      onToggleReady={handleToggleReady}
      onReconnect={handleReconnect}
    />
  );
}
