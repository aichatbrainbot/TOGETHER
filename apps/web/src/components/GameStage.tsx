import {
  EMOTE_PINGS,
  type EmotePingId,
  type GameWorldState,
  INPUT_BITS,
  type SimEvent,
  type SimPlayerState,
  getNextLevelId,
  resolveLevel,
} from '@together/game-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ActiveEmote, GameRenderer, type RenderedPlayerPose } from '../game/GameRenderer.js';
import type { GameSettings } from '../game/settings.js';
import { SoundEngine } from '../game/SoundEngine.js';
import {
  CloseIcon,
  FullscreenIcon,
  RestartIcon,
  SettingsIcon,
  SoundOffIcon,
  SoundOnIcon,
} from './Icons.js';

interface GameStageProps {
  world: GameWorldState;
  events: readonly SimEvent[];
  eventBatchId: number;
  emotesByPlayerId: ReadonlyMap<string, ActiveEmote>;
  emoteSeq: number;
  localUserId: string;
  isHost: boolean;
  pingMs: number | null;
  settings: GameSettings;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onSendInput: (seq: number, buttons: number) => void;
  onSendEmote: (emote: EmotePingId) => void;
  onSwapSolo: () => void;
  onRestartLevel: () => void;
  onStartNextLevel: (nextLevelId: string, proceduralSeed?: number) => void;
  onReturnLobby: () => void;
}

function formatTimer(ms: number): string {
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function GameStage({
  world,
  events,
  eventBatchId,
  emotesByPlayerId,
  emoteSeq,
  localUserId,
  isHost,
  pingMs,
  settings,
  onUpdateSettings,
  onSendInput,
  onSendEmote,
  onSwapSolo,
  onRestartLevel,
  onStartNextLevel,
  onReturnLobby,
}: GameStageProps) {
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);

  const [pauseOpen, setPauseOpen] = useState(false);

  const activeLevel = useMemo(
    () => resolveLevel(world.levelId, world.proceduralSeed),
    [world.levelId, world.proceduralSeed],
  );

  const latestWorldRef = useRef<GameWorldState>(world);
  const activeLevelRef = useRef(activeLevel);
  const settingsRef = useRef<GameSettings>(settings);
  const emotesRef = useRef<ReadonlyMap<string, ActiveEmote>>(emotesByPlayerId);
  const viewportRef = useRef<{ w: number; h: number }>({
    w: activeLevel.width,
    h: activeLevel.height,
  });
  const posesRef = useRef<Map<string, RenderedPlayerPose>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());
  const touchBitsRef = useRef<number>(0);
  const gamepadBitsRef = useRef<number>(0);
  const prevGamepadSwapRef = useRef<boolean>(false);
  const lastSentBitsRef = useRef<number>(-1);
  const seqRef = useRef<number>(1);
  const lastEventBatchRef = useRef<number>(-1);
  const lastEmoteSeqRef = useRef<number>(0);

  if (!rendererRef.current) rendererRef.current = new GameRenderer();
  if (!soundRef.current) soundRef.current = new SoundEngine();

  activeLevelRef.current = activeLevel;
  settingsRef.current = settings;
  emotesRef.current = emotesByPlayerId;

  useEffect(() => {
    soundRef.current?.setMuted(!settings.soundEnabled);
    soundRef.current?.setVolume(settings.volume);
  }, [settings.soundEnabled, settings.volume]);

  useEffect(() => {
    if (emoteSeq > lastEmoteSeqRef.current) {
      lastEmoteSeqRef.current = emoteSeq;
      soundRef.current?.play('emote');
    }
  }, [emoteSeq]);

  // Keep latest authoritative snapshot in ref & trigger event VFX/SFX once per batch
  useEffect(() => {
    latestWorldRef.current = world;

    const poses = posesRef.current;
    const validIds = new Set<string>();
    for (const p of world.players) {
      validIds.add(p.id);
      const existing = poses.get(p.id);
      if (!existing || Math.hypot(existing.x - p.x, existing.y - p.y) > 96) {
        poses.set(p.id, {
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          facing: p.facing,
          grounded: p.grounded,
        });
      }
    }
    for (const id of poses.keys()) {
      if (!validIds.has(id)) poses.delete(id);
    }

    if (eventBatchId !== lastEventBatchRef.current) {
      lastEventBatchRef.current = eventBatchId;
      if (events.length > 0) {
        rendererRef.current?.spawnEventParticles(events);
        const playedTypes = new Set<SimEvent['type']>();
        for (const ev of events) {
          if (!playedTypes.has(ev.type)) {
            playedTypes.add(ev.type);
            soundRef.current?.play(ev.type);
          }
        }
      }
    }
  }, [world, events, eventBatchId]);

  // True edge-to-edge full-screen canvas sizing (DPR-aware)
  useEffect(() => {
    const container = stageRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      viewportRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    updateCanvasSize();
    const ro = new ResizeObserver(updateCanvasSize);
    ro.observe(container);
    window.addEventListener('resize', updateCanvasSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  const computeButtons = useCallback((): number => {
    let bits = touchBitsRef.current | gamepadBitsRef.current;
    const keys = keysRef.current;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) bits |= INPUT_BITS.LEFT;
    if (keys.has('ArrowRight') || keys.has('KeyD')) bits |= INPUT_BITS.RIGHT;
    if (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space')) bits |= INPUT_BITS.JUMP;
    return bits;
  }, []);

  const flushInput = useCallback(
    (force = false) => {
      const bits = computeButtons();
      if (force || bits !== lastSentBitsRef.current) {
        lastSentBitsRef.current = bits;
        seqRef.current += 1;
        onSendInput(seqRef.current, bits);
      }
    },
    [computeButtons, onSendInput],
  );

  // Keyboard controls, emote hotkeys (1-4), Esc pause overlay, blur safety release
  useEffect(() => {
    const preventKeys = new Set([
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Space',
      'Tab',
    ]);

    const onKeyDown = (e: KeyboardEvent) => {
      soundRef.current?.unlock();
      if (preventKeys.has(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;

      if (e.code === 'Escape') {
        setPauseOpen((open) => !open);
        return;
      }

      if (e.code === 'Digit1') {
        onSendEmote('stack');
        return;
      }
      if (e.code === 'Digit2') {
        onSendEmote('wait');
        return;
      }
      if (e.code === 'Digit3') {
        onSendEmote('go');
        return;
      }
      if (e.code === 'Digit4') {
        onSendEmote('nice');
        return;
      }

      if (e.code === 'Tab' && latestWorldRef.current.soloPractice) {
        onSwapSolo();
        return;
      }
      if (e.code === 'KeyR') {
        onRestartLevel();
        return;
      }

      keysRef.current.add(e.code);
      flushInput(false);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      flushInput(false);
    };

    const onBlur = () => {
      keysRef.current.clear();
      touchBitsRef.current = 0;
      gamepadBitsRef.current = 0;
      flushInput(true);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onSendInput(seqRef.current + 1, 0);
    };
  }, [flushInput, onRestartLevel, onSendEmote, onSendInput, onSwapSolo]);

  // 60 FPS full-screen animation loop + Gamepad API polling + smooth interpolation
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const pollGamepad = () => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      const pad = pads.find((g) => g && g.connected);
      if (!pad) {
        if (gamepadBitsRef.current !== 0) {
          gamepadBitsRef.current = 0;
          flushInput(false);
        }
        return;
      }

      let gBits = 0;
      const axisX = pad.axes[0] ?? 0;
      const dpadLeft = pad.buttons[14]?.pressed ?? false;
      const dpadRight = pad.buttons[15]?.pressed ?? false;
      const jumpPressed = (pad.buttons[0]?.pressed ?? false) || (pad.buttons[1]?.pressed ?? false);
      const swapPressed = pad.buttons[3]?.pressed ?? false;

      if (axisX < -0.35 || dpadLeft) gBits |= INPUT_BITS.LEFT;
      if (axisX > 0.35 || dpadRight) gBits |= INPUT_BITS.RIGHT;
      if (jumpPressed) gBits |= INPUT_BITS.JUMP;

      if (swapPressed && !prevGamepadSwapRef.current && latestWorldRef.current.soloPractice) {
        onSwapSolo();
      }
      prevGamepadSwapRef.current = swapPressed;

      if (gBits !== gamepadBitsRef.current) {
        gamepadBitsRef.current = gBits;
        flushInput(false);
      }
    };

    const frame = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      pollGamepad();

      const currentWorld = latestWorldRef.current;
      const poses = posesRef.current;
      const smoothFactor = 1 - Math.exp(-24 * dtSec);

      for (const p of currentWorld.players) {
        const pose = poses.get(p.id);
        if (!pose) {
          poses.set(p.id, {
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            facing: p.facing,
            grounded: p.grounded,
          });
        } else {
          pose.x += (p.x - pose.x) * smoothFactor;
          pose.y += (p.y - pose.y) * smoothFactor;
          pose.vx = p.vx;
          pose.vy = p.vy;
          pose.facing = p.facing;
          pose.grounded = p.grounded;
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          rendererRef.current?.render(ctx, currentWorld, poses, localUserId, dtSec, {
            level: activeLevelRef.current,
            viewportWidth: viewportRef.current.w,
            viewportHeight: viewportRef.current.h,
            showPlayerNames: settingsRef.current.showPlayerNames,
            colorblindShapes: settingsRef.current.colorblindShapes,
            highContrast: settingsRef.current.highContrast,
            reducedMotion: settingsRef.current.reducedMotion,
            emotesByPlayerId: emotesRef.current,
            nowMs: Date.now(),
          });
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [flushInput, localUserId, onSwapSolo]);

  const setTouchBit = (bit: number, active: boolean) => {
    soundRef.current?.unlock();
    if (active) {
      touchBitsRef.current |= bit;
    } else {
      touchBitsRef.current &= ~bit;
    }
    flushInput(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  };

  const controlledPlayer: SimPlayerState | undefined = useMemo(() => {
    const targetId = world.soloPractice ? (world.soloActiveId ?? localUserId) : localUserId;
    return world.players.find((p) => p.id === targetId);
  }, [world, localUserId]);

  const nextCampaignId = getNextLevelId(world.levelId);
  const isProcedural = world.levelId.startsWith('procedural');
  const displayTimeMs = world.completionTimeMs ?? world.elapsedMs;
  const goldParRemaining =
    world.modifier === 'speed_run'
      ? Math.max(0, activeLevel.parTimeMs.gold - displayTimeMs)
      : null;

  return (
    <section ref={stageRef} className="game-stage-fullscreen">
      <canvas
        ref={canvasRef}
        className="game-canvas-fullscreen"
        aria-label={`TOGETHER? ${activeLevel.name} ${activeLevel.title}`}
      />

      {/* Translucent Floating Top HUD */}
      <div className="floating-hud">
        <div className="hud-cluster">
          <span className="hud-level-title">
            {activeLevel.name} · {activeLevel.title.toUpperCase()}
          </span>
          <span className={`pill ${world.soloPractice ? 'pill-warning' : 'pill-accent'}`}>
            {world.soloPractice
              ? 'SOLO'
              : `CO-OP · ${world.players.filter((p) => p.connected).length}P`}
          </span>
          {world.modifier !== 'standard' && (
            <span className="pill pill-mint">
              {world.modifier === 'low_gravity' ? 'LOW-G' : 'SPEED RUN'}
            </span>
          )}
          <span className="hud-stat">
            <code>{formatTimer(displayTimeMs)}</code>
          </span>
          {goldParRemaining !== null && (
            <span className="hud-stat">
              Gold Par <code>{formatTimer(goldParRemaining)}</code>
            </span>
          )}
          <span className="hud-stat hud-respawns">
            Respawns <code>{world.respawnCount}</code>
          </span>
          {pingMs !== null && (
            <span className="hud-stat hud-ping">
              <code>{pingMs} ms</code>
            </span>
          )}
        </div>

        <div className="hud-cluster">
          {world.soloPractice && (
            <button
              type="button"
              className="hud-btn hud-btn-accent"
              onClick={onSwapSolo}
              title="Swap control between P1 and Solo Partner (Tab)"
            >
              Swap {controlledPlayer?.badge ?? 'P1'} [Tab]
            </button>
          )}
          <button
            type="button"
            className="hud-btn hud-btn-icon"
            onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
            title={settings.soundEnabled ? 'Mute sound' : 'Unmute sound'}
            aria-label={settings.soundEnabled ? 'Mute sound' : 'Unmute sound'}
          >
            {settings.soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-icon"
            onClick={() => setPauseOpen((v) => !v)}
            title="Quick Settings (Esc)"
            aria-label="Quick Settings"
          >
            <SettingsIcon width={15} height={15} />
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-icon"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
          >
            <FullscreenIcon />
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={onRestartLevel}
            title="Restart level (R)"
          >
            <RestartIcon />
            <span>Restart</span>
          </button>
          {isHost && (
            <button type="button" className="hud-btn" onClick={onReturnLobby}>
              Menu
            </button>
          )}
        </div>
      </div>

      {/* Floating Bottom Control Hints, Quick Emotes, and Mobile Touch Controls */}
      <div className="floating-bottom-controls">
        <div className="desktop-bottom-bar">
          <div className="desktop-hints-pill">
            <span>
              <code>A/D</code> Move
            </span>
            <span>
              <code>Space</code> Jump &amp; Stack
            </span>
            {world.soloPractice && (
              <span>
                <code>Tab</code> Swap
              </span>
            )}
            <span>
              <code>R</code> Restart
            </span>
            <span>
              <code>Esc</code> Options
            </span>
          </div>

          <div className="emote-bar" aria-label="Quick Emote Pings">
            {EMOTE_PINGS.map((em) => (
              <button
                key={em.id}
                type="button"
                className="emote-chip"
                onClick={() => onSendEmote(em.id)}
                title={`Ping "${em.label}" (Key ${em.key})`}
              >
                <span className="emote-key">{em.key}</span>
                {em.label}
              </button>
            ))}
          </div>
        </div>

        <div className="touch-controls" aria-label="Touch Controls">
          <div className="touch-pad-left">
            <button
              type="button"
              className="touch-btn"
              onPointerDown={(e) => {
                e.preventDefault();
                setTouchBit(INPUT_BITS.LEFT, true);
              }}
              onPointerUp={() => setTouchBit(INPUT_BITS.LEFT, false)}
              onPointerLeave={() => setTouchBit(INPUT_BITS.LEFT, false)}
              onPointerCancel={() => setTouchBit(INPUT_BITS.LEFT, false)}
            >
              ◀
            </button>
            <button
              type="button"
              className="touch-btn"
              onPointerDown={(e) => {
                e.preventDefault();
                setTouchBit(INPUT_BITS.RIGHT, true);
              }}
              onPointerUp={() => setTouchBit(INPUT_BITS.RIGHT, false)}
              onPointerLeave={() => setTouchBit(INPUT_BITS.RIGHT, false)}
              onPointerCancel={() => setTouchBit(INPUT_BITS.RIGHT, false)}
            >
              ▶
            </button>
          </div>
          <div className="touch-pad-right">
            {world.soloPractice && (
              <button type="button" className="touch-btn touch-btn-swap" onClick={onSwapSolo}>
                SWAP
              </button>
            )}
            <button
              type="button"
              className="touch-btn touch-btn-jump"
              onPointerDown={(e) => {
                e.preventDefault();
                setTouchBit(INPUT_BITS.JUMP, true);
              }}
              onPointerUp={() => setTouchBit(INPUT_BITS.JUMP, false)}
              onPointerLeave={() => setTouchBit(INPUT_BITS.JUMP, false)}
              onPointerCancel={() => setTouchBit(INPUT_BITS.JUMP, false)}
            >
              JUMP
            </button>
          </div>
        </div>
      </div>

      {/* In-Game Quick Options Overlay (Esc) */}
      {pauseOpen && world.status !== 'completed' && (
        <div
          className="victory-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPauseOpen(false);
          }}
        >
          <div className="panel pause-card" role="dialog" aria-modal="true">
            <div className="drawer-header">
              <h2>Quick Options</h2>
              <button
                type="button"
                className="icon-close-btn"
                onClick={() => setPauseOpen(false)}
                aria-label="Close options"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="drawer-body settings-list">
              <label className="setting-row surface">
                <span>Sound Effects</span>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                />
              </label>
              <label className="setting-row surface setting-row-col">
                <div className="setting-row-top">
                  <span>Volume</span>
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
                <span>Colorblind Player Shapes</span>
                <input
                  type="checkbox"
                  checked={settings.colorblindShapes}
                  onChange={(e) => onUpdateSettings({ colorblindShapes: e.target.checked })}
                />
              </label>
              <label className="setting-row surface">
                <span>High-Contrast Outlines</span>
                <input
                  type="checkbox"
                  checked={settings.highContrast}
                  onChange={(e) => onUpdateSettings({ highContrast: e.target.checked })}
                />
              </label>
              <label className="setting-row surface">
                <span>Reduced Motion</span>
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => onUpdateSettings({ reducedMotion: e.target.checked })}
                />
              </label>
              <div className="victory-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setPauseOpen(false)}
                >
                  Resume
                </button>
                {isHost && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setPauseOpen(false);
                      onReturnLobby();
                    }}
                  >
                    Main Menu
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chamber Cleared Victory Overlay with Medals & Next Chamber Progression */}
      {world.status === 'completed' && (
        <div className="victory-overlay">
          <div className="panel victory-card">
            <span className={`pill pill-medal-${world.medal ?? 'bronze'}`}>
              {(world.medal ?? 'bronze').toUpperCase()} MEDAL · {activeLevel.name}
            </span>
            <h2 className="victory-title">TOGETHER!</h2>
            <p className="victory-subtitle">
              {activeLevel.title} cleared! Gold par: {formatTimer(activeLevel.parTimeMs.gold)}
            </p>
            <div className="victory-stats">
              <div className="surface stat-tile">
                <span className="muted-label">Clear Time</span>
                <strong>{formatTimer(world.completionTimeMs ?? world.elapsedMs)}</strong>
              </div>
              <div className="surface stat-tile">
                <span className="muted-label">Respawns</span>
                <strong>{world.respawnCount}</strong>
              </div>
            </div>
            <div className="victory-actions">
              {isHost && nextCampaignId && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onStartNextLevel(nextCampaignId)}
                >
                  Next Chamber →
                </button>
              )}
              {isHost && isProcedural && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const nextSeed = Math.floor(100_000 + Math.random() * 899_999);
                    onStartNextLevel(`procedural:${nextSeed}`, nextSeed);
                  }}
                >
                  New Seed →
                </button>
              )}
              <button
                type="button"
                className={`btn ${isHost && (nextCampaignId || isProcedural) ? 'btn-secondary' : 'btn-primary'}`}
                onClick={onRestartLevel}
              >
                Replay
              </button>
              {isHost && (
                <button type="button" className="btn btn-secondary" onClick={onReturnLobby}>
                  Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
