import type { ActivityPlayer, ActivityRoomState } from '@together/game-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelAvatarCanvas } from './components/PixelAvatarCanvas.js';
import {
  type ActivitySessionContext,
  type BootProgress,
  type DiscordUserSummary,
  bootstrapDiscordActivity,
} from './discord/activityClient.js';
import { ActivitySocketClient, type ConnectionState } from './net/ActivitySocket.js';

interface ActivityEventLogItem {
  id: number;
  text: string;
  time: string;
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
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
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<ActivityEventLogItem[]>([]);

  const socketRef = useRef<ActivitySocketClient | null>(null);
  const logSeqRef = useRef(0);

  const pushLog = (text: string) => {
    logSeqRef.current += 1;
    setEventLog((prev) => [{ id: logSeqRef.current, text, time: formatTime() }, ...prev].slice(0, 8));
  };

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
              }
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
  }, []);

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
          <span>/ {room?.maxPlayers ?? 8} in session</span>
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

  // Error screen with clear actionable troubleshooting
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
            <p className="muted-label">Last step reached: <code>{bootProgress.step}</code></p>
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
          <span className="muted-label">Phase 1 · Discord Activity Handshake</span>
        </section>
      </main>
    );
  }

  const toggleReady = () => {
    if (!selfPlayer || !socketRef.current) return;
    socketRef.current.setReady(!selfPlayer.ready);
  };

  const hasMultiplayerPair = connectedPlayers.length >= (room?.minPlayers ?? 2);

  return (
    <main className="activity-shell">
      <header className="top-bar panel">
        <div className="brand-group">
          <span className="brand-mark">TOGETHER?</span>
          <span className={`pill ${context.mode === 'discord' ? 'pill-accent' : 'pill-warning'}`}>
            {context.mode === 'discord' ? 'DISCORD ACTIVITY' : 'LOCAL PREVIEW (NOT IN DISCORD)'}
          </span>
        </div>

        <div className="telemetry-group">
          <span className="telemetry-chip">
            <span className={`status-dot status-${connectionState}`} />
            {connectionState === 'connected'
              ? `Synced${pingMs !== null ? ` · ${pingMs} ms` : ''}`
              : connectionState.toUpperCase()}
          </span>
          <span className="telemetry-chip muted-chip" title={context.instanceId}>
            Instance: <code>{shortId(context.instanceId)}</code>
          </span>
        </div>
      </header>

      <section className="content-grid">
        <div className="panel roster-panel">
          <div className="panel-header">
            <div>
              <h1 className="panel-title">Shared Activity Session</h1>
              <p className="panel-subtitle">
                Everyone launching this Activity in the same channel joins automatically via{' '}
                <code>instanceId</code>.
              </p>
            </div>
            <div className="count-badge">
              <span>{connectedPlayers.length}</span>
              <span className="count-divider">/</span>
              <span>{room?.maxPlayers ?? 8}</span>
            </div>
          </div>

          {socketError && (
            <div className="alert-banner">
              <span>{socketError}</span>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => socketRef.current?.reconnectNow()}
              >
                Reconnect
              </button>
            </div>
          )}

          <div className="player-grid">
            {(room?.players ?? []).map((player) => {
              const isSelf = player.id === context.user.id;
              return (
                <article
                  key={player.id}
                  className={`player-card surface ${isSelf ? 'player-card-self' : ''} ${
                    !player.connected ? 'player-card-offline' : ''
                  }`}
                  style={{ '--player-color': player.color } as React.CSSProperties}
                >
                  <div className="avatar-stack">
                    {player.avatarUrl ? (
                      <img
                        src={player.avatarUrl}
                        alt={`${player.displayName} avatar`}
                        className="discord-avatar"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="discord-avatar avatar-fallback">
                        <PixelAvatarCanvas
                          color={player.color}
                          connected={player.connected}
                          ready={player.ready}
                          size={36}
                        />
                      </div>
                    )}
                    <span className="slot-badge" style={{ backgroundColor: player.color }}>
                      {player.badge}
                    </span>
                  </div>

                  <div className="player-meta">
                    <div className="player-name-row">
                      <span className="player-display-name">{player.displayName}</span>
                      {isSelf && <span className="mini-tag">YOU</span>}
                      {player.isHost && <span className="mini-tag mini-tag-host">HOST</span>}
                    </div>
                    <span className="player-username">@{player.username}</span>
                    <div className="player-status-row">
                      {!player.connected ? (
                        <span className="state-text state-offline">Reconnecting (30s grace)</span>
                      ) : player.ready ? (
                        <span className="state-text state-ready">Ready</span>
                      ) : (
                        <span className="state-text state-connected">Connected</span>
                      )}
                    </div>
                  </div>

                  <div className="sprite-preview" title="Phase 2 Pixel Character">
                    <PixelAvatarCanvas
                      color={player.color}
                      connected={player.connected}
                      ready={player.ready}
                      size={32}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="action-bar">
            <div className="readiness-summary">
              {hasMultiplayerPair ? (
                <span className="status-good">
                  {connectedPlayers.length} players synced in this instance ({readyCount} ready).
                  Phase 1 multiplayer verification active.
                </span>
              ) : (
                <span className="muted-note">
                  Have a second Discord user click <strong>Join Activity</strong> in your test server
                  to verify shared <code>instanceId</code> sync.
                </span>
              )}
            </div>

            <div className="action-buttons">
              <button
                type="button"
                className={`btn ${selfPlayer?.ready ? 'btn-secondary' : 'btn-primary'}`}
                onClick={toggleReady}
                disabled={connectionState !== 'connected' || !selfPlayer}
              >
                {selfPlayer?.ready ? 'Cancel Ready' : 'Mark Ready'}
              </button>
              {connectionState !== 'connected' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => socketRef.current?.reconnectNow()}
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="side-column">
          <section className="panel info-panel">
            <h2 className="section-title">Activity Diagnostics</h2>
            <dl className="meta-list">
              <div>
                <dt>Client Platform</dt>
                <dd>{context.platform}</dd>
              </div>
              <div>
                <dt>Auth Source</dt>
                <dd>{context.mode === 'discord' ? 'Discord OAuth2' : 'Local Dev Token'}</dd>
              </div>
              <div>
                <dt>SDK Participants</dt>
                <dd>{sdkParticipants.length} detected</dd>
              </div>
              <div>
                <dt>WebSocket Proxy</dt>
                <dd>
                  <code>{context.mode === 'discord' ? '/.proxy/ws' : '/ws'}</code>
                </dd>
              </div>
              <div>
                <dt>Phase Gate</dt>
                <dd className="accent-mint">Phase 1 · Launch &amp; Sync</dd>
              </div>
            </dl>
          </section>

          <section className="panel log-panel">
            <h2 className="section-title">Live Session Events</h2>
            <ul className="event-log">
              {eventLog.map((item) => (
                <li key={item.id}>
                  <span className="log-time">{item.time}</span>
                  <span className="log-text">{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
