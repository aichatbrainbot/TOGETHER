import {
  type ActivityPlayer,
  type ActivityRoomState,
  CAMPAIGN_LEVELS,
  CHALLENGE_MODIFIERS,
  type ChallengeModifier,
  type LeaderboardEntry,
  type LevelDefinition,
  NIGHTMARE_LEVELS,
  NORMAL_LEVELS,
  type PlayerProfileStats,
  SPECIAL_LEVELS,
  getLevelUnlockStatus,
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
  InviteIcon,
  LockIcon,
  PlayIcon,
  SettingsIcon,
  SignalIcon,
  SoundOffIcon,
  SoundOnIcon,
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
type StagePageId = 'normal' | 'special' | 'nightmare' | 'procedural';

const STAGE_PAGES: readonly {
  readonly id: StagePageId;
  readonly pageNumber: number;
  readonly label: string;
  readonly codes: string;
  readonly description: string;
}[] = [
  {
    id: 'normal',
    pageNumber: 1,
    label: 'Page 1 · Standard',
    codes: '1 · 2 · 3 · 4',
    description: 'Core cooperative fundamentals. Clear all 4 Ranked to unlock Special & Lab pages.',
  },
  {
    id: 'special',
    pageNumber: 2,
    label: 'Page 2 · Special',
    codes: 'S1 · S2 · S3 · S4',
    description: 'High-pressure relay trials. Stages unlock sequentially in Ranked mode.',
  },
  {
    id: 'nightmare',
    pageNumber: 3,
    label: 'Page 3 · Nightmare',
    codes: 'N1 · N2 · N3 · N4',
    description: 'Master precision gauntlets with tight timing, lasers, and co-op sync.',
  },
  {
    id: 'procedural',
    pageNumber: 4,
    label: 'Page 4 · Endless Lab',
    codes: '∞ SEEDED',
    description: 'Deterministic seeded co-op chambers generated mathematically per seed.',
  },
];

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
  const [stagePage, setStagePage] = useState<StagePageId>('normal');
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
  const canInviteInDiscord = context.mode === 'discord' && Boolean(context.guildId);

  const selectedLevel = useMemo(
    () => resolveLevel(room?.selectedLevelId ?? 'chamber-01', room?.selectedSeed),
    [room?.selectedLevelId, room?.selectedSeed],
  );
  const activeModifier: ChallengeModifier = room?.modifier ?? 'standard';

  const clearedLevelIds = useMemo(() => {
    const ids = new Set<string>();
    if (profile?.bestTimesByLevel) {
      for (const id of Object.keys(profile.bestTimesByLevel)) {
        ids.add(id);
      }
    }
    for (const cl of room?.sessionClears ?? []) {
      if (cl.modifier !== 'low_gravity') {
        ids.add(cl.levelId);
      }
    }
    return ids;
  }, [profile, room?.sessionClears]);

  const serverUnlockedSet = useMemo(
    () => (room?.unlockedLevelIds ? new Set(room.unlockedLevelIds) : null),
    [room?.unlockedLevelIds],
  );

  const getStageLock = (levelId: string) => {
    const fallback = getLevelUnlockStatus(levelId, clearedLevelIds);
    if (!serverUnlockedSet) return fallback;
    const isProc = levelId.startsWith('procedural');
    const isUnlocked = isProc ? serverUnlockedSet.has('procedural') : serverUnlockedSet.has(levelId);
    if (isUnlocked) return { unlocked: true, requirementText: '' };
    return {
      unlocked: false,
      requirementText: fallback.requirementText || 'Clear prerequisite stages (Ranked) to unlock',
    };
  };

  const unlockedCampaignCount = useMemo(
    () => CAMPAIGN_LEVELS.filter((lvl) => getStageLock(lvl.id).unlocked).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearedLevelIds, serverUnlockedSet],
  );

  // Fetch player progression profile on mount so stage cards display medals, best times & DarkCoins
  useEffect(() => {
    let active = true;
    const apiPrefix = context.mode === 'discord' ? '/.proxy/api' : '/api';
    fetch(`${apiPrefix}/profile/${encodeURIComponent(context.user.id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ profile?: PlayerProfileStats | null }>) : { profile: null }))
      .then((profRes) => {
        if (active) setProfile(profRes.profile ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [context.mode, context.user.id, room?.sessionClears.length]);

  useEffect(() => {
    if (!activePanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePanel]);

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

  const renderDifficultyStars = (difficulty: number) =>
    `${'★'.repeat(Math.max(1, Math.min(5, difficulty)))}${'☆'.repeat(
      Math.max(0, 5 - Math.max(1, Math.min(5, difficulty))),
    )}`;

  const renderStageCard = (lvl: LevelDefinition) => {
    const isSelected = selectedLevel.id === lvl.id;
    const isSpecial = lvl.tier === 'special';
    const isNightmare = lvl.tier === 'nightmare';
    const lockInfo = getStageLock(lvl.id);
    const isLocked = !lockInfo.unlocked;
    const bestTime = profile?.bestTimesByLevel?.[lvl.id];
    const bestMedal = profile?.bestMedalsByLevel?.[lvl.id];
    const bestCoins = profile?.bestCoinsByLevel?.[lvl.id] ?? 0;
    const totalCoins = lvl.coins?.length ?? 3;

    return (
      <div
        key={lvl.id}
        className={`chamber-card surface ${isSelected ? 'chamber-card-live' : ''} ${
          isSpecial ? 'chamber-card-special' : ''
        } ${isNightmare ? 'chamber-card-nightmare' : ''} ${
          isLocked ? 'chamber-card-locked' : ''
        }`}
      >
        <div className="chamber-card-head">
          <div className="chamber-title-group">
            <span
              className={`stage-code-pill ${isSpecial ? 'stage-code-special' : ''} ${
                isNightmare ? 'stage-code-nightmare' : ''
              }`}
              style={{
                borderColor: isLocked ? 'rgba(147, 155, 178, 0.45)' : lvl.themeAccent,
                color: isLocked ? '#939BB2' : lvl.themeAccent,
              }}
            >
              {lvl.code}
            </span>
            <strong>{lvl.title}</strong>
          </div>
          <div className="chamber-badges-right">
            {isLocked ? (
              <span className="pill pill-locked">
                <LockIcon width={12} height={12} />
                LOCKED
              </span>
            ) : (
              bestMedal && (
                <span className={`pill pill-medal-${bestMedal}`} title="Best Ranked Medal">
                  {bestMedal.toUpperCase()}
                </span>
              )
            )}
            <span
              className="difficulty-stars"
              style={{ color: isLocked ? '#6c748d' : lvl.themeAccent }}
              title={`Difficulty ${lvl.difficulty}/5`}
            >
              {renderDifficultyStars(lvl.difficulty)}
            </span>
          </div>
        </div>
        <p className="muted-note">{lvl.subtitle}</p>
        <div className="chamber-card-foot">
          <div className="chamber-meta-tags">
            <span className="pill pill-accent">{lvl.mechanicTag}</span>
            <span className="log-time">
              {isLocked
                ? lockInfo.requirementText
                : bestTime !== undefined
                  ? `Best ${formatMs(bestTime)} · ${bestCoins}/${totalCoins} Coins`
                  : `Par ${formatMs(lvl.parTimeMs.gold)} · ${totalCoins} Coins`}
            </span>
          </div>
          {isHost && !isLocked && (
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

      {/* Clean Top Overlay Header Bar (no technical debug IDs or duplicate drawer triggers) */}
      <header className="menu-topbar">
        <div className="menu-top-cluster">
          <div className="menu-top-pill">
            <span className={`pill ${context.mode === 'discord' ? 'pill-accent' : 'pill-warning'}`}>
              {context.mode === 'discord' ? 'DISCORD ACTIVITY' : 'LOCAL PREVIEW'}
            </span>
            <span className="top-pill-sub">
              Stage <strong>{selectedLevel.code}</strong> · {selectedLevel.title}
            </span>
          </div>

          <button
            type="button"
            className="menu-top-pill menu-icon-pill"
            onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
            title={settings.soundEnabled ? 'Mute sound & music' : 'Unmute sound & music'}
            aria-label={settings.soundEnabled ? 'Mute sound' : 'Unmute sound'}
          >
            {settings.soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>
        </div>

        <div className="menu-top-cluster">
          {canInviteInDiscord && (
            <button
              type="button"
              className="menu-top-pill menu-invite-pill"
              onClick={() => void context.openInviteDialog()}
            >
              <InviteIcon />
              <span>Invite Friends</span>
            </button>
          )}

          <div className="menu-top-pill menu-squad-summary">
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
          </div>
        </div>
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
                {activeModifier !== 'standard'
                  ? ` · ${activeModifier === 'low_gravity' ? 'Chaos (Unranked)' : 'Speed Run'}`
                  : ''}
              </small>
            </span>
          </button>

          <button
            type="button"
            className={`menu-btn ${activePanel === 'chambers' ? 'menu-btn-active' : ''}`}
            onClick={() => {
              if (activePanel !== 'chambers') {
                const tier = selectedLevel.tier;
                setStagePage(
                  tier === 'special' || tier === 'nightmare' || tier === 'procedural'
                    ? tier
                    : 'normal',
                );
              }
              setActivePanel(activePanel === 'chambers' ? null : 'chambers');
            }}
          >
            <span className="menu-btn-icon">
              <ChambersIcon />
            </span>
            <span className="menu-btn-label">Stage Pages (12 + Lab)</span>
            <span className="menu-btn-badge">{selectedLevel.code}</span>
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

      {/* Bottom Tagline & Network Telemetry */}
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
                {activePanel === 'chambers' && `Stage Pages · ${unlockedCampaignCount}/12 Unlocked`}
                {activePanel === 'leaderboard' && 'Leaderboard & Profile'}
                {activePanel === 'settings' && 'Settings & Display'}
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
                  {isHost ? (
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
                  ) : (
                    canInviteInDiscord && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void context.openInviteDialog()}
                      >
                        <InviteIcon />
                        Invite
                      </button>
                    )
                  )}
                </div>

                {(room?.sessionClears.length ?? 0) > 0 && (
                  <div className="drawer-section">
                    <h3 className="section-title">Session Clears</h3>
                    <ul className="event-log">
                      {room!.sessionClears.slice(0, 5).map((cl, idx) => (
                        <li key={`${cl.levelId}-${cl.clearedAt}-${idx}`} className="session-clear-row">
                          <div>
                            <strong>{cl.levelName}</strong>
                            <span className="log-time">
                              {' '}
                              · {formatMs(cl.completionTimeMs)} · {cl.respawnCount} falls
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

                <details className="drawer-section diagnostics-details">
                  <summary className="section-title diagnostics-summary">
                    Connection Log ({sdkParticipants.length} in channel · {context.platform})
                  </summary>
                  <ul className="event-log" style={{ marginTop: 8 }}>
                    {eventLog.map((item) => (
                      <li key={item.id}>
                        <span className="log-time">{item.time}</span>
                        <span className="log-text">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}

            {activePanel === 'chambers' && (() => {
              const pageIndex = STAGE_PAGES.findIndex((p) => p.id === stagePage);
              const pageMeta = STAGE_PAGES[Math.max(0, pageIndex)]!;
              const pageLevels =
                stagePage === 'normal'
                  ? NORMAL_LEVELS
                  : stagePage === 'special'
                    ? SPECIAL_LEVELS
                    : stagePage === 'nightmare'
                      ? NIGHTMARE_LEVELS
                      : [];
              const labLock = getStageLock('procedural:428109');
              const pageLocked =
                stagePage === 'special'
                  ? !getStageLock(SPECIAL_LEVELS[0]!.id).unlocked
                  : stagePage === 'nightmare'
                    ? !getStageLock(NIGHTMARE_LEVELS[0]!.id).unlocked
                    : stagePage === 'procedural'
                      ? !labLock.unlocked
                      : false;
              const pageUnlockNote =
                stagePage === 'special'
                  ? getStageLock(SPECIAL_LEVELS[0]!.id).requirementText
                  : stagePage === 'nightmare'
                    ? getStageLock(NIGHTMARE_LEVELS[0]!.id).requirementText
                    : stagePage === 'procedural'
                      ? labLock.requirementText
                      : '';
              const clearedOnPage = pageLevels.filter((lvl) => clearedLevelIds.has(lvl.id)).length;

              return (
                <div className="drawer-body">
                  {!isHost && (
                    <p className="muted-note">
                      Only the Host (<strong>{hostPlayer?.displayName ?? 'Host'}</strong>) can
                      launch or switch stages.
                    </p>
                  )}

                  {/* Page Switcher Tabs */}
                  <div className="stage-pages-tabs" role="tablist" aria-label="Stage Pages">
                    {STAGE_PAGES.map((pg) => {
                      const isPgLocked =
                        pg.id === 'special'
                          ? !getStageLock(SPECIAL_LEVELS[0]!.id).unlocked
                          : pg.id === 'nightmare'
                            ? !getStageLock(NIGHTMARE_LEVELS[0]!.id).unlocked
                            : pg.id === 'procedural'
                              ? !labLock.unlocked
                              : false;
                      return (
                        <button
                          key={pg.id}
                          type="button"
                          role="tab"
                          aria-selected={stagePage === pg.id}
                          className={`stage-page-tab ${
                            stagePage === pg.id ? 'stage-page-tab-active' : ''
                          } ${pg.id === 'nightmare' ? 'stage-page-tab-nightmare' : ''} ${
                            isPgLocked ? 'stage-page-tab-locked' : ''
                          }`}
                          onClick={() => setStagePage(pg.id)}
                        >
                          <span className="stage-page-tab-top">
                            <span>P{pg.pageNumber}</span>
                            {isPgLocked && <LockIcon width={11} height={11} />}
                          </span>
                          <small>{pg.id.toUpperCase()}</small>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Page Header Banner */}
                  <div
                    className={`stage-page-banner surface ${
                      pageLocked ? 'stage-page-banner-locked' : ''
                    }`}
                  >
                    <div className="stage-tier-header" style={{ padding: 0 }}>
                      <span className="stage-tier-title">{pageMeta.label}</span>
                      <span
                        className={`stage-tier-badge ${
                          stagePage === 'special'
                            ? 'stage-tier-badge-special'
                            : stagePage === 'nightmare'
                              ? 'stage-tier-badge-nightmare'
                              : ''
                        }`}
                      >
                        {pageLocked
                          ? 'LOCKED'
                          : pageLevels.length > 0
                            ? `${clearedOnPage}/${pageLevels.length} Cleared`
                            : pageMeta.codes}
                      </span>
                    </div>
                    <p className="muted-note">
                      {pageLocked ? pageUnlockNote : pageMeta.description}
                    </p>
                  </div>

                  {/* Active Page Stage List */}
                  {stagePage !== 'procedural' ? (
                    pageLevels.map(renderStageCard)
                  ) : (
                    <div
                      className={`chamber-card surface ${
                        selectedLevel.id.startsWith('procedural:') ? 'chamber-card-live' : ''
                      } ${!labLock.unlocked ? 'chamber-card-locked' : ''}`}
                    >
                      <div className="chamber-card-head">
                        <div className="chamber-title-group">
                          <span className="stage-code-pill">∞</span>
                          <strong>Procedural Lab</strong>
                        </div>
                        {labLock.unlocked ? (
                          <span className="pill pill-mint">SEEDED</span>
                        ) : (
                          <span className="pill pill-locked">
                            <LockIcon width={12} height={12} />
                            LOCKED
                          </span>
                        )}
                      </div>
                      <p className="muted-note">
                        {labLock.unlocked
                          ? 'Deterministic seeded generator combining stacking, moving ferries, crates, keys, and vault plates. Same seed = same chamber for everyone.'
                          : labLock.requirementText}
                      </p>
                      <div className="seed-row">
                        <input
                          type="text"
                          className="seed-input"
                          value={seedInput}
                          maxLength={12}
                          disabled={!isHost || !labLock.unlocked}
                          onChange={(e) => setSeedInput(e.target.value)}
                          aria-label="Procedural seed"
                          placeholder="Seed (e.g. 428109)"
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          disabled={!isHost || !labLock.unlocked}
                          onClick={handleRandomSeed}
                          title="Randomize seed"
                        >
                          <DiceIcon />
                        </button>
                        {isHost && labLock.unlocked && (
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
                  )}

                  {/* Prev / Next Page Controls */}
                  <div className="stage-page-pager">
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={pageIndex <= 0}
                      onClick={() => setStagePage(STAGE_PAGES[Math.max(0, pageIndex - 1)]!.id)}
                    >
                      ← Prev Page
                    </button>
                    <span className="log-time">
                      Page {pageMeta.pageNumber} / {STAGE_PAGES.length}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={pageIndex >= STAGE_PAGES.length - 1}
                      onClick={() =>
                        setStagePage(
                          STAGE_PAGES[Math.min(STAGE_PAGES.length - 1, pageIndex + 1)]!.id,
                        )
                      }
                    >
                      Next Page →
                    </button>
                  </div>

                  {/* Challenge Modifiers */}
                  <div className="drawer-section">
                    <h3 className="section-title">
                      Challenge Modifier (Only Ranked unlocks new pages)
                    </h3>
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
              );
            })()}

            {activePanel === 'leaderboard' && (
              <div className="drawer-body">
                <div className="surface profile-box">
                  <div className="profile-head">
                    <strong>{context.user.displayName}</strong>
                    <span className="mini-tag">RANKED PROFILE</span>
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
                        <span className="muted-label">Coins</span>
                        <strong>{profile.totalCoinsCollected ?? 0}</strong>
                      </div>
                      <div>
                        <span className="muted-label">Keys</span>
                        <strong>{profile.keysCollected}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="muted-note">
                      Complete a Ranked stage (Standard or Speed Run) to record best times, medals,
                      and DarkCoins!
                    </p>
                  )}
                </div>

                <div className="filter-pills">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'chamber-01', label: '1' },
                    { id: 'chamber-02', label: '2' },
                    { id: 'chamber-03', label: '3' },
                    { id: 'chamber-04', label: '4' },
                    { id: 'stage-s1', label: 'S1' },
                    { id: 'stage-s2', label: 'S2' },
                    { id: 'stage-s3', label: 'S3' },
                    { id: 'stage-s4', label: 'S4' },
                    { id: 'stage-n1', label: 'N1' },
                    { id: 'stage-n2', label: 'N2' },
                    { id: 'stage-n3', label: 'N3' },
                    { id: 'stage-n4', label: 'N4' },
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
                    <strong>No Ranked Records Yet</strong>
                    <p className="muted-note">
                      Clear any stage in Standard or Speed Run mode to claim the #1 time!
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
                            {entry.totalCoins
                              ? ` · ${entry.coinsCollected ?? 0}/${entry.totalCoins} Coins`
                              : ''}
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

                <label className="setting-row surface">
                  <div>
                    <strong>Ambient Synth Music</strong>
                    <p className="muted-note">Soft atmospheric background pad during stages</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.musicEnabled}
                    disabled={!settings.soundEnabled}
                    onChange={(e) => onUpdateSettings({ musicEnabled: e.target.checked })}
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
                    <p className="muted-note">Calms ambient particles and camera shake</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) => onUpdateSettings({ reducedMotion: e.target.checked })}
                  />
                </label>

                <label className="setting-row surface">
                  <div>
                    <strong>Fill Screen (Edge-to-Edge)</strong>
                    <p className="muted-note">
                      Scales gameplay edge-to-edge inside Discord without letterbox bars
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.fillViewport}
                    onChange={(e) => onUpdateSettings({ fillViewport: e.target.checked })}
                  />
                </label>

                <label className="setting-row surface">
                  <div>
                    <strong>Cinema Mode (Minimal HUD)</strong>
                    <p className="muted-note">
                      Hides extra HUD &amp; control hints during play for max screen space (Key{' '}
                      <code>F</code>)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.cinemaMode}
                    onChange={(e) => onUpdateSettings({ cinemaMode: e.target.checked })}
                  />
                </label>
              </div>
            )}

            {activePanel === 'howto' && (
              <div className="drawer-body howto-list">
                <div className="surface howto-item">
                  <strong>Controls (Keyboard, Gamepad &amp; Touch)</strong>
                  <p className="muted-note">
                    Move: <code>A/D</code> · Jump: <code>Space</code> · Drop Through One-Way Ledge:{' '}
                    <code>S</code> / <code>↓</code> · Personal Respawn at Checkpoint: <code>C</code>{' '}
                    · Cinema Full View: <code>F</code> · Emotes: <code>1–4</code> · Host Full
                    Restart: <code>R</code> · Solo Partner Swap/Follow: <code>Tab</code> /{' '}
                    <code>Q</code>.
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>Standard Stages (1 · 2 · 3 · 4)</strong>
                  <p className="muted-note">
                    <strong>1 Synchrony:</strong> Head-stacking &amp; vault plates.{' '}
                    <strong>2 Cadence:</strong> Ferries, keys &amp; 5s bridge.{' '}
                    <strong>3 Leverage:</strong> Push ×1 &amp; ×2 crates together.{' '}
                    <strong>4 Relay:</strong> Bounce pads, laser switches, crumbling steps &amp;
                    checkpoints!
                  </p>
                </div>
                <div className="surface howto-item">
                  <strong>Locked Pages: Special (S1–S4), Nightmare (N1–N4) &amp; Lab</strong>
                  <p className="muted-note">
                    Each stage hides <code>3 DarkCoins</code>! Clear Standard <code>1–4</code> Ranked
                    to unlock <strong>Page 2 (S1–S4)</strong> and <strong>Procedural Lab</strong>,
                    then conquer <code>S1 → S4</code> Ranked to unlock{' '}
                    <strong>Page 3 Nightmare (N1–N4)</strong>! Jumping is precision-tuned — no free
                    mid-air escapes!
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
