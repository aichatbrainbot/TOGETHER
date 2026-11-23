import type { ActivityPlayer, ActivityRoomState } from '@together/game-core';
import { useState } from 'react';
import type { ActivitySessionContext, DiscordUserSummary } from '../discord/activityClient.js';
import type { GameSettings } from '../game/settings.js';
import type { ConnectionState } from '../net/ActivitySocket.js';
import {
  ChambersIcon,
  CloseIcon,
  CrownIcon,
  InfoIcon,
  PlayIcon,
  SettingsIcon,
  SignalIcon,
  TogetherCrest,
  UsersIcon,
} from './Icons.js';
import { MenuBackdropCanvas } from './MenuBackdropCanvas.js';
import { PixelAvatarCanvas } from './PixelAvatarCanvas.js';

interface EventLogItem {
  id: number;
  text: string;
  time: string;
}

interface GameMenuProps {
  context: ActivitySessionContext;
  room: ActivityRoomState | null;
  selfPlayer: ActivityPlayer | undefined;
  connectedPlayers: readonly ActivityPlayer[];
  readyCount: number;
  sdkParticipants: readonly DiscordUserSummary[];
  connectionState: ConnectionState;
  pingMs: number | null;
  socketError: string | null;
  eventLog: readonly EventLogItem[];
  settings: GameSettings;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onStartGame: () => void;
  onToggleReady: () => void;
  onReconnect: () => void;
}

type ActivePanel = null | 'squad' | 'chambers' | 'settings' | 'howto';

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function GameMenu({
  context,
  room,
  selfPlayer,
  connectedPlayers,
  readyCount,
  sdkParticipants,
  connectionState,
  pingMs,
  socketError,
  eventLog,
  settings,
  onUpdateSettings,
  onStartGame,
  onToggleReady,
  onReconnect,
}: GameMenuProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const isHost = Boolean(selfPlayer?.isHost);
  const isSolo = connectedPlayers.length <= 1;
  const hostPlayer = room?.players.find((p) => p.isHost);

  const handlePrimaryPlay = () => {
    if (isHost) {
      onStartGame();
    } else {
      onToggleReady();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <main className="menu-screen">
      <MenuBackdropCanvas
        players={room?.players ?? []}
        reducedMotion={settings.reducedMotion}
      />

      {/* Top Overlay Header Bar */}
      <header className="menu-topbar">
        <div className="menu-top-pill" title={context.instanceId}>
          <span className={`pill ${context.mode === 'discord' ? 'pill-accent' : 'pill-warning'}`}>
            {context.mode === 'discord' ? 'DISCORD ACTIVITY' : 'LOCAL PREVIEW'}
          </span>
          <span className="top-pill-sub">
            Instance <code>{shortId(context.instanceId)}</code>
          </span>
        </div>

        <button
          type="button"
          className="menu-top-pill menu-squad-pill"
          onClick={() => setActivePanel(activePanel === 'squad' ? null : 'squad')}
        >
          <CrownIcon className="crown-accent" />
          <div className="squad-pill-text">
            <span className="squad-pill-label">
              {hostPlayer ? `Host · ${hostPlayer.displayName}` : 'Connecting Squad'}
            </span>
            <span className="squad-pill-meta">
              {connectedPlayers.length}/{room?.maxPlayers ?? 8} Online · {readyCount} Ready
            </span>
          </div>
          <div className="mini-avatar-cluster">
            {connectedPlayers.slice(0, 4).map((p) =>
              p.avatarUrl ? (
                <img
                  key={p.id}
                  src={p.avatarUrl}
                  alt={p.displayName}
                  className="cluster-avatar"
                  style={{ borderColor: p.color }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  key={p.id}
                  className="cluster-avatar cluster-badge"
                  style={{ borderColor: p.color, color: p.color }}
                >
                  {p.badge}
                </span>
              ),
            )}
          </div>
        </button>
      </header>

      {/* Main Center Stage: Left Vertical Game Menu + Center Crest Title */}
      <section className="menu-stage">
        <nav className="menu-rail" aria-label="Main Game Menu">
          <button
            type="button"
            className="menu-btn menu-btn-play"
            onClick={handlePrimaryPlay}
            disabled={connectionState !== 'connected' || !selfPlayer}
          >
            <span className="menu-btn-icon">
              <PlayIcon />
            </span>
            <span className="menu-btn-copy">
              <strong>
                {isHost
                  ? isSolo
                    ? 'Play Solo'
                    : `Play Co-op (${connectedPlayers.length}P)`
                  : selfPlayer?.ready
                    ? 'Ready ✓'
                    : 'Ready Up'}
              </strong>
              <small>
                {isHost
                  ? isSolo
                    ? 'Chamber 01 · Solo Practice'
                    : `Chamber 01 · ${readyCount}/${connectedPlayers.length} Ready`
                  : selfPlayer?.ready
                    ? 'Waiting for Host to launch'
                    : 'Confirm ready for Chamber 01'}
              </small>
            </span>
          </button>

          <button
            type="button"
            className={`menu-btn ${activePanel === 'squad' ? 'menu-btn-active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'squad' ? null : 'squad')}
          >
            <span className="menu-btn-icon">
              <UsersIcon />
            </span>
            <span className="menu-btn-label">Squad Lobby</span>
            <span className="menu-btn-badge">
              {connectedPlayers.length}/{room?.maxPlayers ?? 8}
            </span>
          </button>

          <button
            type="button"
            className={`menu-btn ${activePanel === 'chambers' ? 'menu-btn-active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'chambers' ? null : 'chambers')}
          >
            <span className="menu-btn-icon">
              <ChambersIcon />
            </span>
            <span className="menu-btn-label">Chambers</span>
            <span className="menu-btn-badge">01</span>
          </button>

          <button
            type="button"
            className={`menu-btn ${activePanel === 'settings' ? 'menu-btn-active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'settings' ? null : 'settings')}
          >
            <span className="menu-btn-icon">
              <SettingsIcon />
            </span>
            <span className="menu-btn-label">Settings</span>
          </button>

          <button
            type="button"
            className={`menu-btn ${activePanel === 'howto' ? 'menu-btn-active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'howto' ? null : 'howto')}
          >
            <span className="menu-btn-icon">
              <InfoIcon />
            </span>
            <span className="menu-btn-label">How to Play</span>
          </button>

          {socketError && (
            <div className="menu-inline-alert">
              <span>{socketError}</span>
              <button type="button" className="btn btn-secondary btn-compact" onClick={onReconnect}>
                Reconnect
              </button>
            </div>
          )}
        </nav>

        <div className="menu-hero-title">
          <TogetherCrest className="hero-crest" />
          <h1 className="hero-wordmark">TOGETHER?</h1>
          <p className="hero-subtitle">Cooperative Dark Puzzle Platformer</p>
        </div>
      </section>

      {/* Bottom Tagline & Real Network Telemetry */}
      <footer className="menu-footer">
        <span className="menu-tagline">PLAY TOGETHER · SOLVE TOGETHER · WIN TOGETHER</span>
        <div className="menu-telemetry-pill">
          <span className={`status-dot status-${connectionState}`} />
          <span>
            {connectionState === 'connected'
              ? `Online: ${connectedPlayers.length}${pingMs !== null ? ` · ${pingMs} ms` : ''}`
              : connectionState.toUpperCase()}
          </span>
          <SignalIcon pingMs={pingMs} />
        </div>
      </footer>

      {/* Slide-Over Panel / Modal Overlay for Squad, Chambers, Settings, How To Play */}
      {activePanel && (
        <div
          className="menu-drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActivePanel(null);
          }}
        >
          <aside className="panel menu-drawer" role="dialog" aria-modal="true">
            <div className="drawer-header">
              <h2>
                {activePanel === 'squad' && `Squad Lobby (${connectedPlayers.length}/${room?.maxPlayers ?? 8})`}
                {activePanel === 'chambers' && 'Chambers'}
                {activePanel === 'settings' && 'Settings'}
                {activePanel === 'howto' && 'How to Play'}
              </h2>
              <button
                type="button"
                className="icon-close-btn"
                onClick={() => setActivePanel(null)}
                aria-label="Close panel"
              >
                <CloseIcon />
              </button>
            </div>

            {activePanel === 'squad' && (
              <div className="drawer-body">
                <div className="drawer-player-list">
                  {(room?.players ?? []).map((player) => {
                    const isSelf = player.id === context.user.id;
                    return (
                      <article
                        key={player.id}
                        className={`player-card surface ${isSelf ? 'player-card-self' : ''} ${
                          !player.connected ? 'player-card-offline' : ''
                        }`}
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
                          <span className="player-display-name" title={player.displayName}>
                            {player.displayName}
                          </span>
                          <span className="player-username">@{player.username}</span>
                          <div className="player-status-row">
                            {!player.connected ? (
                              <span className="state-text state-offline">Reconnecting (30s)</span>
                            ) : player.ready ? (
                              <span className="state-text state-ready">Ready</span>
                            ) : (
                              <span className="state-text state-connected">Connected</span>
                            )}
                            {isSelf && <span className="mini-tag">YOU</span>}
                            {player.isHost && <span className="mini-tag mini-tag-host">HOST</span>}
                          </div>
                        </div>

                        <div className="sprite-preview">
                          <PixelAvatarCanvas
                            color={player.color}
                            connected={player.connected}
                            ready={player.ready}
                            size={30}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="drawer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onToggleReady}
                    disabled={connectionState !== 'connected' || !selfPlayer}
                  >
                    {selfPlayer?.ready ? 'Cancel Ready' : 'Mark Ready'}
                  </button>
                  {isHost && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setActivePanel(null);
                        onStartGame();
                      }}
                      disabled={connectionState !== 'connected' || connectedPlayers.length === 0}
                    >
                      {isSolo ? 'Start Solo' : `Launch (${connectedPlayers.length}P)`}
                    </button>
                  )}
                </div>

                <div className="drawer-section">
                  <h3 className="section-title">
                    Session Diagnostics ({sdkParticipants.length} SDK detected · {context.platform})
                  </h3>
                  <ul className="event-log compact-log">
                    {eventLog.map((item) => (
                      <li key={item.id}>
                        <span className="log-time">{item.time}</span>
                        <span className="log-text">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activePanel === 'chambers' && (
              <div className="drawer-body">
                <div className="chamber-card surface chamber-card-live">
                  <div className="chamber-card-head">
                    <strong>Chamber 01 · Synchrony</strong>
                    <span className="pill pill-accent">PLAYABLE</span>
                  </div>
                  <p className="muted-note">
                    Stack on teammates to reach the high relay, lock the neon energy bridge, and hold
                    both vault plates together to open the exit.
                  </p>
                  {isHost && (
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => {
                        setActivePanel(null);
                        onStartGame();
                      }}
                    >
                      Launch Chamber 01
                    </button>
                  )}
                </div>

                <div className="chamber-card surface chamber-card-locked">
                  <div className="chamber-card-head">
                    <strong>Chamber 02 · Timing</strong>
                    <span className="mini-tag">PHASE 4</span>
                  </div>
                  <p className="muted-note">
                    Synchronized moving platforms and timed pressure bridges for 2–8 players.
                  </p>
                </div>

                <div className="chamber-card surface chamber-card-locked">
                  <div className="chamber-card-head">
                    <strong>Chamber 03 · Teamwork</strong>
                    <span className="mini-tag">PHASE 4</span>
                  </div>
                  <p className="muted-note">
                    Heavy multi-player push crates, shared keys, and locked cooperative gates.
                  </p>
                </div>
              </div>
            )}

            {activePanel === 'settings' && (
              <div className="drawer-body settings-list">
                <label className="setting-row surface">
                  <div>
                    <strong>Sound Effects</strong>
                    <p className="muted-note">Procedural Web Audio dark-synth SFX</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                  />
                </label>

                <label className="setting-row surface setting-row-col">
                  <div className="setting-row-top">
                    <strong>Master Volume</strong>
                    <code>{Math.round(settings.volume * 100)}%</code>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(settings.volume * 100)}
                    disabled={!settings.soundEnabled}
                    onChange={(e) => onUpdateSettings({ volume: Number(e.target.value) / 100 })}
                  />
                </label>

                <label className="setting-row surface">
                  <div>
                    <strong>Player Name Tags</strong>
                    <p className="muted-note">Display Discord names above characters in-game</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showPlayerNames}
                    onChange={(e) => onUpdateSettings({ showPlayerNames: e.target.checked })}
                  />
                </label>

                <label className="setting-row surface">
                  <div>
                    <strong>Reduced Motion</strong>
                    <p className="muted-note">Calms embers, bobs, and gameplay particles</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) => onUpdateSettings({ reducedMotion: e.target.checked })}
                  />
                </label>

                <button type="button" className="btn btn-secondary" onClick={toggleFullscreen}>
                  Toggle Fullscreen Display
                </button>
              </div>
            )}

            {activePanel === 'howto' && (
              <div className="drawer-body howto-list">
                <div className="surface howto-item">
                  <strong>Controls</strong>
                  <p className="muted-note">
                    Move with <code>A / D</code> or <code>← / →</code>. Jump with{' '}
                    <code>W / ↑ / Space</code>. Restart anytime with <code>R</code>. On mobile, touch
                    controls appear automatically.
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>1. Stack Together</strong>
                  <p className="muted-note">
                    Every character has a flat crown — jump onto a teammate&apos;s head to reach high
                    ledges no single player can jump to alone.
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>2. Power &amp; Lock the Bridge</strong>
                  <p className="muted-note">
                    Stand on the high violet <code>BRIDGE</code> plate to form the energy bridge. A
                    teammate crosses and steps on <code>LOCK</code> to keep it active permanently.
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>3. Unlock the Vault Together</strong>
                  <p className="muted-note">
                    Hold plates <code>A</code> and <code>B</code> simultaneously to unlock the exit
                    gate, then enter together to clear the chamber. In Solo mode, press{' '}
                    <code>Tab</code> to swap characters.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
