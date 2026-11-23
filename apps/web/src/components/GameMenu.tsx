import {
  type ActivityPlayer,
  type ActivityRoomState,
  CAMPAIGN_LEVELS,
  CHALLENGE_MODIFIERS,
  type ChallengeModifier,
  type LeaderboardEntry,
  type PlayerProfileStats,
  normalizeProceduralSeed,
  resolveLevel,
} from '@together/game-core';
import { useEffect, useMemo, useState } from 'react';
import type { ActivitySessionContext, DiscordUserSummary } from '../discord/activityClient.js';
import type { GameSettings } from '../game/settings.js';
import type { ConnectionState } from '../net/ActivitySocket.js';
import {
  ChambersIcon,
  CloseIcon,
  CrownIcon,
  DiceIcon,
  InfoIcon,
  PlayIcon,
  SettingsIcon,
  SignalIcon,
  TogetherCrest,
  TrophyIcon,
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
  onSelectLevel: (params: {
    levelId: string;
    proceduralSeed?: number | null;
    modifier?: ChallengeModifier;
  }) => void;
  onStartGame: (options?: {
    levelId?: string;
    proceduralSeed?: number | null;
    modifier?: ChallengeModifier;
  }) => void;
  onToggleReady: () => void;
  onReconnect: () => void;
}

type ActivePanel = null | 'squad' | 'chambers' | 'leaderboard' | 'settings' | 'howto';

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
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
  onSelectLevel,
  onStartGame,
  onToggleReady,
  onReconnect,
}: GameMenuProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [seedInput, setSeedInput] = useState<string>(() =>
    String(room?.selectedSeed ?? 428109),
  );
  const [lbFilter, setLbFilter] = useState<string>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [profile, setProfile] = useState<PlayerProfileStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const isHost = Boolean(selfPlayer?.isHost);
  const isSolo = connectedPlayers.length <= 1;
  const hostPlayer = room?.players.find((p) => p.isHost);

  const selectedLevel = useMemo(
    () => resolveLevel(room?.selectedLevelId ?? 'chamber-01', room?.selectedSeed),
    [room?.selectedLevelId, room?.selectedSeed],
  );
  const activeModifier: ChallengeModifier = room?.modifier ?? 'standard';

  // Close drawer cleanly on Escape key
  useEffect(() => {
    if (!activePanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePanel]);

  // Fetch real Leaderboard & Player Profile from server when Leaderboard drawer opens
  useEffect(() => {
    if (activePanel !== 'leaderboard') return;
    let active = true;
    const apiPrefix = context.mode === 'discord' ? '/.proxy/api' : '/api';
    const levelQuery = lbFilter === 'all' ? '' : `?levelId=${encodeURIComponent(lbFilter)}`;

    setLoadingStats(true);
    Promise.all([
      fetch(`${apiPrefix}/leaderboard${levelQuery}`).then((r) =>
        r.ok ? (r.json() as Promise<{ entries?: LeaderboardEntry[] }>) : { entries: [] },
      ),
      fetch(`${apiPrefix}/profile/${encodeURIComponent(context.user.id)}`).then((r) =>
        r.ok ? (r.json() as Promise<{ profile?: PlayerProfileStats | null }>) : { profile: null },
      ),
    ])
      .then(([lbRes, profRes]) => {
        if (!active) return;
        setLeaderboard(lbRes.entries ?? []);
        setProfile(profRes.profile ?? null);
      })
      .catch(() => {
        if (!active) return;
        setLeaderboard([]);
      })
      .finally(() => {
        if (active) setLoadingStats(false);
      });

    return () => {
      active = false;
    };
  }, [activePanel, lbFilter, context.mode, context.user.id]);

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

  const handleRandomSeed = () => {
    const next = Math.floor(100_000 + Math.random() * 899_999);
    setSeedInput(String(next));
    if (isHost) {
      onSelectLevel({ levelId: `procedural:${next}`, proceduralSeed: next });
    }
  };

  const handleLaunchProcedural = () => {
    const normalized = normalizeProceduralSeed(seedInput);
    setSeedInput(String(normalized));
    setActivePanel(null);
    onStartGame({ levelId: `procedural:${normalized}`, proceduralSeed: normalized });
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
                {selectedLevel.name} · {selectedLevel.title}
                {activeModifier !== 'standard' ? ` · ${activeModifier.replace('_', ' ')}` : ''}
              </small>
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
            <span className="menu-btn-badge">{selectedLevel.order <= 9 ? `0${selectedLevel.order}` : '∞'}</span>
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
            className={`menu-btn ${activePanel === 'leaderboard' ? 'menu-btn-active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'leaderboard' ? null : 'leaderboard')}
          >
            <span className="menu-btn-icon">
              <TrophyIcon />
            </span>
            <span className="menu-btn-label">Leaderboard</span>
            {(room?.sessionClears.length ?? 0) > 0 && (
              <span className="menu-btn-badge">{room?.sessionClears.length}</span>
            )}
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

      {/* Slide-Over Panel / Modal Overlay */}
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
                {activePanel === 'squad' &&
                  `Squad Lobby (${connectedPlayers.length}/${room?.maxPlayers ?? 8})`}
                {activePanel === 'chambers' && 'Select Chamber & Modifiers'}
                {activePanel === 'leaderboard' && 'Leaderboard & Profile'}
                {activePanel === 'settings' && 'Settings & Accessibility'}
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

                {(room?.sessionClears.length ?? 0) > 0 && (
                  <div className="drawer-section">
                    <h3 className="section-title">This Session&apos;s Clears</h3>
                    <ul className="event-log">
                      {room!.sessionClears.slice(0, 5).map((cl, idx) => (
                        <li key={`${cl.levelId}-${cl.clearedAt}-${idx}`} className="session-clear-row">
                          <div>
                            <strong>{cl.levelName}</strong>
                            <span className="log-time">
                              {' '}
                              · {formatMs(cl.completionTimeMs)} · {cl.respawnCount} respawns
                            </span>
                          </div>
                          <span className={`pill pill-medal-${cl.medal}`}>
                            {cl.medal.toUpperCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="drawer-section">
                  <h3 className="section-title">
                    Diagnostics ({sdkParticipants.length} SDK · {context.platform})
                  </h3>
                  <ul className="event-log">
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
                {!isHost && (
                  <p className="muted-note">
                    Only the Host (<strong>{hostPlayer?.displayName ?? 'Host'}</strong>) can change
                    the active chamber and modifier.
                  </p>
                )}

                {CAMPAIGN_LEVELS.map((lvl) => {
                  const isSelected = selectedLevel.id === lvl.id;
                  return (
                    <div
                      key={lvl.id}
                      className={`chamber-card surface ${isSelected ? 'chamber-card-live' : ''}`}
                    >
                      <div className="chamber-card-head">
                        <strong>
                          {lvl.name} · {lvl.title}
                        </strong>
                        <span className="pill pill-accent">{lvl.mechanicTag}</span>
                      </div>
                      <p className="muted-note">{lvl.subtitle}</p>
                      <div className="chamber-card-foot">
                        <span className="log-time">
                          Gold Par: {formatMs(lvl.parTimeMs.gold)}
                        </span>
                        {isHost && (
                          <div className="chamber-card-btns">
                            {!isSelected && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => onSelectLevel({ levelId: lvl.id })}
                              >
                                Select
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-primary btn-compact"
                              onClick={() => {
                                setActivePanel(null);
                                onStartGame({ levelId: lvl.id });
                              }}
                            >
                              Play
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Deterministic Procedural Lab (Zero AI!) */}
                <div
                  className={`chamber-card surface ${
                    selectedLevel.id.startsWith('procedural:') ? 'chamber-card-live' : ''
                  }`}
                >
                  <div className="chamber-card-head">
                    <strong>Procedural Lab (Seeded)</strong>
                    <span className="pill pill-mint">ZERO-AI</span>
                  </div>
                  <p className="muted-note">
                    Deterministic seeded generator combining stacking, moving ferries, crates, keys,
                    and vault plates. Same seed = same chamber for everyone.
                  </p>
                  <div className="seed-row">
                    <input
                      type="text"
                      className="seed-input"
                      value={seedInput}
                      maxLength={12}
                      disabled={!isHost}
                      onChange={(e) => setSeedInput(e.target.value)}
                      aria-label="Procedural seed"
                      placeholder="Seed (e.g. 428109)"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={!isHost}
                      onClick={handleRandomSeed}
                      title="Randomize seed"
                    >
                      <DiceIcon />
                    </button>
                    {isHost && (
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        onClick={handleLaunchProcedural}
                      >
                        Play Seed
                      </button>
                    )}
                  </div>
                </div>

                {/* Challenge Modifiers */}
                <div className="drawer-section">
                  <h3 className="section-title">Challenge Modifier</h3>
                  <div className="modifier-grid">
                    {CHALLENGE_MODIFIERS.map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        disabled={!isHost}
                        className={`modifier-chip surface ${
                          activeModifier === mod.id ? 'modifier-chip-active' : ''
                        }`}
                        onClick={() =>
                          onSelectLevel({
                            levelId: selectedLevel.id,
                            proceduralSeed: selectedLevel.proceduralSeed,
                            modifier: mod.id,
                          })
                        }
                      >
                        <strong>{mod.name}</strong>
                        <span>{mod.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'leaderboard' && (
              <div className="drawer-body">
                {/* Verified Player Profile Card */}
                <div className="surface profile-box">
                  <div className="profile-head">
                    <strong>{context.user.displayName}</strong>
                    <span className="mini-tag">YOUR PROFILE</span>
                  </div>
                  {profile ? (
                    <div className="profile-stats-grid">
                      <div>
                        <span className="muted-label">Clears</span>
                        <strong>{profile.chambersCleared}</strong>
                      </div>
                      <div>
                        <span className="muted-label">Gold</span>
                        <strong className="medal-gold">{profile.medals.gold}</strong>
                      </div>
                      <div>
                        <span className="muted-label">Switches</span>
                        <strong>{profile.switchesTriggered}</strong>
                      </div>
                      <div>
                        <span className="muted-label">Keys</span>
                        <strong>{profile.keysCollected}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="muted-note">
                      No recorded clears yet. Complete a chamber to start tracking your best times
                      and medals!
                    </p>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="filter-pills">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'chamber-01', label: '01' },
                    { id: 'chamber-02', label: '02' },
                    { id: 'chamber-03', label: '03' },
                    { id: 'procedural', label: 'Labs' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`filter-pill ${lbFilter === f.id ? 'filter-pill-active' : ''}`}
                      onClick={() => setLbFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {loadingStats ? (
                  <p className="muted-note">Loading leaderboard...</p>
                ) : leaderboard.length === 0 ? (
                  <div className="surface howto-item">
                    <strong>No Records Yet</strong>
                    <p className="muted-note">
                      Clear any chamber with your squad (or in Solo Practice) to claim the #1 time!
                    </p>
                  </div>
                ) : (
                  <ul className="leaderboard-list">
                    {leaderboard.map((entry, idx) => (
                      <li key={entry.id} className="surface lb-row">
                        <span className="lb-rank">#{idx + 1}</span>
                        <div className="lb-main">
                          <div className="lb-title-row">
                            <strong>{entry.levelName}</strong>
                            <span className={`pill pill-medal-${entry.medal}`}>
                              {entry.medal.toUpperCase()}
                            </span>
                          </div>
                          <span className="log-time">
                            {entry.playerNames.join(', ')}
                            {entry.soloPractice ? ' (Solo)' : ` (${entry.playerCount}P)`}
                          </span>
                        </div>
                        <div className="lb-time">
                          <code>{formatMs(entry.completionTimeMs)}</code>
                          <span className="log-time">{entry.respawnCount} falls</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
                    <strong>Colorblind Player Shapes</strong>
                    <p className="muted-note">Draw distinct geometric emblems on P1–P8</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.colorblindShapes}
                    onChange={(e) => onUpdateSettings({ colorblindShapes: e.target.checked })}
                  />
                </label>

                <label className="setting-row surface">
                  <div>
                    <strong>High-Contrast Outlines</strong>
                    <p className="muted-note">Crisp bright borders on characters, crates, and ledges</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.highContrast}
                    onChange={(e) => onUpdateSettings({ highContrast: e.target.checked })}
                  />
                </label>

                <label className="setting-row surface">
                  <div>
                    <strong>Reduced Motion</strong>
                    <p className="muted-note">Calms ambient particles and menu animations</p>
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
                  <strong>Controls (Keyboard, Gamepad &amp; Mobile Touch)</strong>
                  <p className="muted-note">
                    Move: <code>A/D</code> or <code>←/→</code> · Jump: <code>W/↑/Space</code> ·
                    Quick Emotes: <code>1–4</code> · Restart: <code>R</code> · Options:{' '}
                    <code>Esc</code> · Solo Partner Swap: <code>Tab</code>. Controllers work
                    automatically!
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>Chamber 01 · Stacking &amp; Vault Plates</strong>
                  <p className="muted-note">
                    Jump onto teammates&apos; flat heads to climb high ledges, power &amp; lock the
                    energy bridge, and stand on plates <code>A + B</code> together.
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>Chamber 02 · Moving Platforms, Timed Bridge &amp; Keys</strong>
                  <p className="muted-note">
                    Ride ferries &amp; lifts to collect floating Security Keys, unlock laser gates,
                    and sprint across the 5-second timed bridge together.
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>Chamber 03 · Cooperative ×1 &amp; ×2 Push Crates</strong>
                  <p className="muted-note">
                    Push light <code>×1</code> crates onto weight plates to power cargo lifts, and
                    team up with 2 players to shove heavy <code>×2</code> crates into place!
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
