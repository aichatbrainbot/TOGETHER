import {
  type CrateRuntimeState,
  EMOTE_PINGS,
  type EmotePingId,
  type GameWorldState,
  INPUT_BITS,
  type KeyRuntimeState,
  type MovingPlatformRuntimeState,
  PHYSICS,
  type SimEvent,
  type SimPlayerState,
  cloneGameWorld,
  getNextLevelId,
  resolveLevel,
  stepGameWorld,
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

export type SnapshotListener = (world: GameWorldState, events: readonly SimEvent[]) => void;

export interface SnapshotBus {
  subscribe: (listener: SnapshotListener) => () => void;
  getLatest: () => GameWorldState | null;
}

interface GameStageProps {
  /** Discrete UI state snapshot (updates ONLY on level/status/respawn/objective changes, never 30x/sec) */
  world: GameWorldState;
  /** High-frequency 30 Hz authoritative snapshot bus bypassing React reconciliation completely */
  snapshotBus: SnapshotBus;
  emotesByPlayerId: ReadonlyMap<string, ActiveEmote>;
  emoteSeq: number;
  localUserId: string;
  mode: 'discord' | 'local-dev';
  isHost: boolean;
  pingMs: number | null;
  settings: GameSettings;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onSetLandscape?: (locked: boolean) => void;
  onSendInput: (seq: number, buttons: number) => void;
  onSendEmote: (emote: EmotePingId) => void;
  onSwapSolo: () => void;
  onToggleSoloFollow: () => void;
  onRespawnSelf: () => void;
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
  snapshotBus,
  emotesByPlayerId,
  emoteSeq,
  localUserId,
  mode,
  isHost,
  pingMs,
  settings,
  onUpdateSettings,
  onSetLandscape,
  onSendInput,
  onSendEmote,
  onSwapSolo,
  onToggleSoloFollow,
  onRespawnSelf,
  onRestartLevel,
  onStartNextLevel,
  onReturnLobby,
}: GameStageProps) {
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerCodeRef = useRef<HTMLElement | null>(null);
  const parCodeRef = useRef<HTMLElement | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);

  const [pauseOpen, setPauseOpen] = useState(false);

  const activeLevel = useMemo(
    () => resolveLevel(world.levelId, world.proceduralSeed),
    [world.levelId, world.proceduralSeed],
  );

  const initialLatest = snapshotBus.getLatest() ?? world;
  const latestWorldRef = useRef<GameWorldState>(initialLatest);
  const predictedWorldRef = useRef<GameWorldState>(cloneGameWorld(initialLatest));
  const predAccumRef = useRef<number>(0);
  const visualErrRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const inputHistoryRef = useRef<Array<{ seq: number; buttons: number }>>([]);
  const sendStrideRef = useRef<number>(0);
  const localJumpSfxAtRef = useRef<number>(0);
  const smoothPlatformsRef = useRef<MovingPlatformRuntimeState[]>([]);
  const smoothCratesRef = useRef<CrateRuntimeState[]>([]);
  const smoothKeysRef = useRef<KeyRuntimeState[]>([]);
  const prevSnapMetaRef = useRef<{
    levelId: string;
    respawnCount: number;
    controlledId: string;
  }>({
    levelId: initialLatest.levelId,
    respawnCount: initialLatest.respawnCount,
    controlledId: initialLatest.soloPractice
      ? (initialLatest.soloActiveId ?? localUserId)
      : localUserId,
  });

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
  const lastEmoteSeqRef = useRef<number>(0);

  if (!rendererRef.current) rendererRef.current = new GameRenderer();
  if (!soundRef.current) soundRef.current = new SoundEngine();

  activeLevelRef.current = activeLevel;
  settingsRef.current = settings;
  emotesRef.current = emotesByPlayerId;

  useEffect(() => {
    onSetLandscape?.(true);
    return () => {
      onSetLandscape?.(false);
      soundRef.current?.dispose();
    };
  }, [onSetLandscape]);

  useEffect(() => {
    soundRef.current?.setMuted(!settings.soundEnabled);
    soundRef.current?.setMusicEnabled(settings.musicEnabled);
    soundRef.current?.setVolume(settings.volume);
  }, [settings.soundEnabled, settings.musicEnabled, settings.volume]);

  useEffect(() => {
    if (emoteSeq > lastEmoteSeqRef.current) {
      lastEmoteSeqRef.current = emoteSeq;
      soundRef.current?.play('emote');
    }
  }, [emoteSeq]);

  const computeButtons = useCallback((): number => {
    let bits = touchBitsRef.current | gamepadBitsRef.current;
    const keys = keysRef.current;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) bits |= INPUT_BITS.LEFT;
    if (keys.has('ArrowRight') || keys.has('KeyD')) bits |= INPUT_BITS.RIGHT;
    if (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space')) bits |= INPUT_BITS.JUMP;
    if (keys.has('ArrowDown') || keys.has('KeyS')) bits |= INPUT_BITS.DOWN;
    return bits;
  }, []);

  const flushInputImmediate = useCallback(
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

  // Direct zero-React-overhead subscription to 30 Hz authoritative server snapshots
  useEffect(() => {
    const handleSnapshot = (nextWorld: GameWorldState, events: readonly SimEvent[]) => {
      latestWorldRef.current = nextWorld;
      const level = resolveLevel(nextWorld.levelId, nextWorld.proceduralSeed);
      activeLevelRef.current = level;

      const controlledId = nextWorld.soloPractice
        ? (nextWorld.soloActiveId ?? localUserId)
        : localUserId;
      const prevMeta = prevSnapMetaRef.current;
      const hardReset =
        prevMeta.levelId !== nextWorld.levelId ||
        prevMeta.respawnCount !== nextWorld.respawnCount ||
        prevMeta.controlledId !== controlledId ||
        nextWorld.status !== 'playing';

      prevSnapMetaRef.current = {
        levelId: nextWorld.levelId,
        respawnCount: nextWorld.respawnCount,
        controlledId,
      };

      const poses = posesRef.current;
      const oldControlledPose = poses.get(controlledId);
      const authControlled = nextWorld.players.find((p) => p.id === controlledId);

      if (hardReset) {
        inputHistoryRef.current.length = 0;
        if (prevMeta.levelId !== nextWorld.levelId) {
          rendererRef.current?.resetEffects();
        }
      } else if (authControlled) {
        const ackSeq = authControlled.lastProcessedSeq;
        let dropCount = 0;
        while (
          dropCount < inputHistoryRef.current.length &&
          inputHistoryRef.current[dropCount]!.seq <= ackSeq
        ) {
          dropCount += 1;
        }
        if (dropCount > 0) {
          inputHistoryRef.current.splice(0, dropCount);
        }
      }

      const reconciled = cloneGameWorld(nextWorld);
      if (!hardReset && nextWorld.status === 'playing' && inputHistoryRef.current.length > 0) {
        const replayCount = Math.min(12, inputHistoryRef.current.length);
        const startIdx = inputHistoryRef.current.length - replayCount;
        for (let i = startIdx; i < inputHistoryRef.current.length; i += 1) {
          const entry = inputHistoryRef.current[i]!;
          stepGameWorld(
            reconciled,
            { [controlledId]: { buttons: entry.buttons, seq: entry.seq } },
            level,
          );
        }
      }

      predictedWorldRef.current = reconciled;
      predAccumRef.current = 0;

      const predControlled = reconciled.players.find((p) => p.id === controlledId);
      if (hardReset || !oldControlledPose || !predControlled) {
        visualErrRef.current = { x: 0, y: 0 };
      } else {
        const dx = oldControlledPose.x - predControlled.x;
        const dy = oldControlledPose.y - predControlled.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 84 || dist < 0.75) {
          visualErrRef.current = { x: 0, y: 0 };
        } else {
          visualErrRef.current = { x: dx, y: dy };
        }
      }

      if (hardReset) {
        smoothPlatformsRef.current = reconciled.movingPlatforms.map((m) => ({ ...m }));
        smoothCratesRef.current = reconciled.crates.map((c) => ({ ...c }));
        smoothKeysRef.current = reconciled.keys.map((k) => ({ ...k }));
      }

      const validIds = new Set<string>();
      for (const p of nextWorld.players) {
        validIds.add(p.id);
        const existing = poses.get(p.id);
        if (p.id === controlledId && predControlled) {
          poses.set(p.id, {
            x: predControlled.x + visualErrRef.current.x,
            y: predControlled.y + visualErrRef.current.y,
            vx: predControlled.vx,
            vy: predControlled.vy,
            facing: predControlled.facing,
            grounded: predControlled.grounded,
          });
        } else if (!existing || hardReset || Math.hypot(existing.x - p.x, existing.y - p.y) > 96) {
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

      if (events.length > 0) {
        const recentLocalJump = Date.now() - localJumpSfxAtRef.current < 350;
        rendererRef.current?.spawnEventParticles(
          events,
          recentLocalJump ? controlledId : undefined,
        );
        const playedTypes = new Set<SimEvent['type']>();
        for (const ev of events) {
          if (ev.type === 'jump' && recentLocalJump && ev.playerId === controlledId) continue;
          if (!playedTypes.has(ev.type)) {
            playedTypes.add(ev.type);
            soundRef.current?.play(ev.type);
          }
        }
      }
    };

    const current = snapshotBus.getLatest();
    if (current) {
      handleSnapshot(current, []);
    }

    return snapshotBus.subscribe(handleSnapshot);
  }, [snapshotBus, localUserId]);

  useEffect(() => {
    const container = stageRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      viewportRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const ctx = canvas.getContext('2d', { alpha: false });
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

  const toggleCinemaExpand = useCallback(() => {
    const nextCinema = !settingsRef.current.cinemaMode;
    onUpdateSettings({ cinemaMode: nextCinema });

    if (mode === 'local-dev') {
      if (nextCinema && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (!nextCinema && document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
    }
  }, [mode, onUpdateSettings]);

  // Keyboard controls: WASD/Arrows/Space + S/Down Drop-Through, F Cinema, C Respawn Self, Q Solo Follow, Host R Restart
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

      if (e.code === 'KeyF') {
        toggleCinemaExpand();
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
      if (e.code === 'KeyQ' && latestWorldRef.current.soloPractice) {
        onToggleSoloFollow();
        return;
      }
      if (e.code === 'KeyC') {
        onRespawnSelf();
        return;
      }
      if (e.code === 'KeyR' && isHost) {
        onRestartLevel();
        return;
      }

      keysRef.current.add(e.code);
      flushInputImmediate(false);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      flushInputImmediate(false);
    };

    const onBlur = () => {
      keysRef.current.clear();
      touchBitsRef.current = 0;
      gamepadBitsRef.current = 0;
      flushInputImmediate(true);
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
  }, [
    flushInputImmediate,
    isHost,
    onRespawnSelf,
    onRestartLevel,
    onSendEmote,
    onSendInput,
    onSwapSolo,
    onToggleSoloFollow,
    toggleCinemaExpand,
  ]);

  // Locked 60 FPS animation loop + client-side prediction + instant local Jump feedback + 60 FPS smoothing
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastHudText = '';
    let lastParText = '';

    const pollGamepad = () => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      const pad = pads.find((g) => g && g.connected);
      if (!pad) {
        if (gamepadBitsRef.current !== 0) {
          gamepadBitsRef.current = 0;
          flushInputImmediate(false);
        }
        return;
      }

      let gBits = 0;
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      const dpadLeft = pad.buttons[14]?.pressed ?? false;
      const dpadRight = pad.buttons[15]?.pressed ?? false;
      const dpadDown = pad.buttons[13]?.pressed ?? false;
      const jumpPressed = (pad.buttons[0]?.pressed ?? false) || (pad.buttons[1]?.pressed ?? false);
      const swapPressed = pad.buttons[3]?.pressed ?? false;

      if (axisX < -0.35 || dpadLeft) gBits |= INPUT_BITS.LEFT;
      if (axisX > 0.35 || dpadRight) gBits |= INPUT_BITS.RIGHT;
      if (axisY > 0.45 || dpadDown) gBits |= INPUT_BITS.DOWN;
      if (jumpPressed) gBits |= INPUT_BITS.JUMP;

      if (swapPressed && !prevGamepadSwapRef.current && latestWorldRef.current.soloPractice) {
        onSwapSolo();
      }
      prevGamepadSwapRef.current = swapPressed;

      if (gBits !== gamepadBitsRef.current) {
        gamepadBitsRef.current = gBits;
        flushInputImmediate(false);
      }
    };

    const frame = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      pollGamepad();

      const currentWorld = latestWorldRef.current;
      const predWorld = predictedWorldRef.current;
      const level = activeLevelRef.current;
      const controlledId = currentWorld.soloPractice
        ? (currentWorld.soloActiveId ?? localUserId)
        : localUserId;

      if (predWorld && predWorld.status === 'playing' && currentWorld.status === 'playing') {
        predAccumRef.current = Math.min(predAccumRef.current + dtSec, PHYSICS.DT * 3);
        const curBits = computeButtons();
        while (predAccumRef.current >= PHYSICS.DT) {
          predAccumRef.current -= PHYSICS.DT;
          seqRef.current += 1;
          const seq = seqRef.current;
          inputHistoryRef.current.push({ seq, buttons: curBits });
          if (inputHistoryRef.current.length > 48) {
            inputHistoryRef.current.splice(0, inputHistoryRef.current.length - 48);
          }

          const stepEvents = stepGameWorld(
            predWorld,
            { [controlledId]: { buttons: curBits, seq } },
            level,
          );
          for (const ev of stepEvents) {
            if (ev.type === 'jump' && ev.playerId === controlledId) {
              const ms = Date.now();
              if (ms - localJumpSfxAtRef.current > 120) {
                localJumpSfxAtRef.current = ms;
                soundRef.current?.play('jump');
                rendererRef.current?.spawnLocalJumpEffect(ev.x, ev.y, ev.color ?? '#54D6C5');
              }
            }
          }

          sendStrideRef.current += 1;
          if (curBits !== lastSentBitsRef.current) {
            lastSentBitsRef.current = curBits;
            onSendInput(seq, curBits);
          } else if (curBits !== 0 && sendStrideRef.current % 2 === 0) {
            onSendInput(seq, curBits);
          }
        }
      }

      const errDecay = Math.exp(-18 * dtSec);
      visualErrRef.current.x *= errDecay;
      visualErrRef.current.y *= errDecay;
      if (Math.abs(visualErrRef.current.x) < 0.08) visualErrRef.current.x = 0;
      if (Math.abs(visualErrRef.current.y) < 0.08) visualErrRef.current.y = 0;

      const poses = posesRef.current;
      const remoteSmooth = 1 - Math.exp(-22 * dtSec);
      const predControlled = predWorld?.players.find((p) => p.id === controlledId);

      for (const p of currentWorld.players) {
        if (p.id === controlledId && predControlled && currentWorld.status === 'playing') {
          poses.set(p.id, {
            x: predControlled.x + visualErrRef.current.x,
            y: predControlled.y + visualErrRef.current.y,
            vx: predControlled.vx,
            vy: predControlled.vy,
            facing: predControlled.facing,
            grounded: predControlled.grounded,
          });
          continue;
        }

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
          pose.x += (p.x - pose.x) * remoteSmooth;
          pose.y += (p.y - pose.y) * remoteSmooth;
          pose.vx = p.vx;
          pose.vy = p.vy;
          pose.facing = p.facing;
          pose.grounded = p.grounded;
        }
      }

      const entitySmooth = 1 - Math.exp(-24 * dtSec);
      const targetPlatforms =
        predWorld && predWorld.levelId === currentWorld.levelId
          ? predWorld.movingPlatforms
          : currentWorld.movingPlatforms;
      if (smoothPlatformsRef.current.length !== targetPlatforms.length) {
        smoothPlatformsRef.current = targetPlatforms.map((m) => ({ ...m }));
      } else {
        for (let i = 0; i < targetPlatforms.length; i += 1) {
          const tgt = targetPlatforms[i]!;
          const cur = smoothPlatformsRef.current[i]!;
          if (Math.hypot(tgt.x - cur.x, tgt.y - cur.y) > 48) {
            cur.x = tgt.x;
            cur.y = tgt.y;
          } else {
            cur.x += (tgt.x - cur.x) * entitySmooth;
            cur.y += (tgt.y - cur.y) * entitySmooth;
          }
          cur.active = tgt.active;
        }
      }

      const targetCrates =
        predWorld && predWorld.levelId === currentWorld.levelId
          ? predWorld.crates
          : currentWorld.crates;
      if (smoothCratesRef.current.length !== targetCrates.length) {
        smoothCratesRef.current = targetCrates.map((c) => ({ ...c }));
      } else {
        for (let i = 0; i < targetCrates.length; i += 1) {
          const tgt = targetCrates[i]!;
          const cur = smoothCratesRef.current[i]!;
          if (Math.hypot(tgt.x - cur.x, tgt.y - cur.y) > 48) {
            cur.x = tgt.x;
            cur.y = tgt.y;
          } else {
            cur.x += (tgt.x - cur.x) * entitySmooth;
            cur.y += (tgt.y - cur.y) * entitySmooth;
          }
          cur.activePushers = currentWorld.crates[i]?.activePushers ?? tgt.activePushers;
        }
      }

      const targetKeys = currentWorld.keys;
      if (smoothKeysRef.current.length !== targetKeys.length) {
        smoothKeysRef.current = targetKeys.map((k) => ({ ...k }));
      } else {
        for (let i = 0; i < targetKeys.length; i += 1) {
          const tgt = targetKeys[i]!;
          const cur = smoothKeysRef.current[i]!;
          if (Math.hypot(tgt.x - cur.x, tgt.y - cur.y) > 64) {
            cur.x = tgt.x;
            cur.y = tgt.y;
          } else {
            cur.x += (tgt.x - cur.x) * entitySmooth;
            cur.y += (tgt.y - cur.y) * entitySmooth;
          }
          cur.carrierPlayerId = tgt.carrierPlayerId;
          cur.used = tgt.used;
        }
      }

      const displayTimeMs = currentWorld.completionTimeMs ?? currentWorld.elapsedMs;
      const nextHudText = formatTimer(displayTimeMs);
      if (nextHudText !== lastHudText) {
        lastHudText = nextHudText;
        if (timerCodeRef.current) {
          timerCodeRef.current.textContent = nextHudText;
        }
      }
      if (currentWorld.modifier === 'speed_run' && parCodeRef.current) {
        const nextParText = formatTimer(Math.max(0, level.parTimeMs.gold - displayTimeMs));
        if (nextParText !== lastParText) {
          lastParText = nextParText;
          parCodeRef.current.textContent = nextParText;
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          const renderWorld: GameWorldState = {
            ...currentWorld,
            movingPlatforms: smoothPlatformsRef.current,
            crates: smoothCratesRef.current,
            keys: smoothKeysRef.current,
          };
          rendererRef.current?.render(ctx, renderWorld, poses, localUserId, dtSec, {
            level,
            viewportWidth: viewportRef.current.w,
            viewportHeight: viewportRef.current.h,
            fillViewport: settingsRef.current.fillViewport,
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
  }, [computeButtons, flushInputImmediate, localUserId, onSendInput, onSwapSolo]);

  const setTouchBit = (bit: number, active: boolean) => {
    soundRef.current?.unlock();
    if (active) {
      touchBitsRef.current |= bit;
    } else {
      touchBitsRef.current &= ~bit;
    }
    flushInputImmediate(false);
  };

  const controlledPlayer: SimPlayerState | undefined = useMemo(() => {
    const targetId = world.soloPractice ? (world.soloActiveId ?? localUserId) : localUserId;
    return world.players.find((p) => p.id === targetId);
  }, [world, localUserId]);

  const nextCampaignId = getNextLevelId(world.levelId);
  const nextCampaignLevel = useMemo(
    () => (nextCampaignId ? resolveLevel(nextCampaignId) : null),
    [nextCampaignId],
  );
  const isProcedural = world.levelId.startsWith('procedural');
  const displayTimeMs = world.completionTimeMs ?? world.elapsedMs;
  const goldParRemaining =
    world.modifier === 'speed_run'
      ? Math.max(0, activeLevel.parTimeMs.gold - displayTimeMs)
      : null;

  const totalCoins = activeLevel.coins?.length ?? world.coins?.length ?? 0;
  const collectedCoins = (world.coins ?? []).filter((c) => c.collected).length;
  const remainingKeys = world.keys.filter((k) => !k.used).length;

  return (
    <section ref={stageRef} className="game-stage-fullscreen">
      <canvas
        ref={canvasRef}
        className="game-canvas-fullscreen"
        aria-label={`TOGETHER? ${activeLevel.name} ${activeLevel.title}`}
      />

      {/* Translucent Floating Top HUD */}
      <div className={`floating-hud ${settings.cinemaMode ? 'floating-hud-cinema' : ''}`}>
        <div className="hud-cluster">
          <span
            className={`hud-stage-badge ${
              activeLevel.tier === 'special' ? 'hud-stage-badge-special' : ''
            }`}
            style={{
              borderColor: activeLevel.themeAccent,
              color: activeLevel.themeAccent,
            }}
          >
            {activeLevel.code}
          </span>
          {!settings.cinemaMode && (
            <span className="hud-level-title">{activeLevel.title.toUpperCase()}</span>
          )}
          {!settings.cinemaMode && (
            <span className={`pill ${world.soloPractice ? 'pill-warning' : 'pill-accent'}`}>
              {world.soloPractice
                ? 'SOLO'
                : `CO-OP · ${world.players.filter((p) => p.connected).length}P`}
            </span>
          )}
          {world.modifier !== 'standard' && (
            <span className="pill pill-mint">
              {world.modifier === 'low_gravity' ? 'CHAOS · UNRANKED' : 'SPEED RUN'}
            </span>
          )}
          <span className="hud-stat">
            <code ref={timerCodeRef}>{formatTimer(displayTimeMs)}</code>
          </span>
          {goldParRemaining !== null && (
            <span className="hud-stat">
              Par <code ref={parCodeRef}>{formatTimer(goldParRemaining)}</code>
            </span>
          )}
          {totalCoins > 0 && (
            <span className="hud-coin-pill" title="DarkCoins collected in this stage">
              <span className="coin-dot" />
              <code>
                {collectedCoins}/{totalCoins}
              </code>
            </span>
          )}
          {!settings.cinemaMode && world.keys.length > 0 && (
            <span className="hud-stat">
              {remainingKeys > 0 ? 'Key Needed' : 'Gate Open'}
            </span>
          )}
          {!settings.cinemaMode && pingMs !== null && (
            <span className="hud-stat hud-ping">
              <code>{pingMs} ms</code>
            </span>
          )}
        </div>

        <div className="hud-cluster">
          {world.soloPractice && (
            <>
              <button
                type="button"
                className="hud-btn hud-btn-accent"
                onClick={onSwapSolo}
                title="Swap control between P1 and Solo Partner (Tab)"
              >
                Swap {controlledPlayer?.badge ?? 'P1'} [Tab]
              </button>
              <button
                type="button"
                className={`hud-btn ${world.soloFollow ? 'hud-btn-active' : ''}`}
                onClick={onToggleSoloFollow}
                title="Toggle Partner Follow Mode (Q)"
              >
                {world.soloFollow ? 'Following [Q]' : 'Follow [Q]'}
              </button>
            </>
          )}
          {!settings.cinemaMode && (
            <button
              type="button"
              className={`hud-btn ${settings.fillViewport ? 'hud-btn-active' : ''}`}
              onClick={() => onUpdateSettings({ fillViewport: !settings.fillViewport })}
              title="Switch between Edge-to-Edge Fill and Classic 16:9 Fit"
            >
              {settings.fillViewport ? 'FILL' : 'FIT'}
            </button>
          )}
          <button
            type="button"
            className={`hud-btn hud-btn-icon ${settings.cinemaMode ? 'hud-btn-active' : ''}`}
            onClick={toggleCinemaExpand}
            title={settings.cinemaMode ? 'Exit Cinema Mode (F)' : 'Cinema / Full View Mode (F)'}
            aria-label={settings.cinemaMode ? 'Exit Cinema Mode' : 'Enter Cinema Mode'}
          >
            <FullscreenIcon />
          </button>
          {!settings.cinemaMode && (
            <button
              type="button"
              className="hud-btn hud-btn-icon"
              onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
              title={settings.soundEnabled ? 'Mute sound' : 'Unmute sound'}
              aria-label={settings.soundEnabled ? 'Mute sound' : 'Unmute sound'}
            >
              {settings.soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
            </button>
          )}
          <button
            type="button"
            className="hud-btn hud-btn-icon"
            onClick={() => setPauseOpen((v) => !v)}
            title="Quick Options (Esc)"
            aria-label="Quick Options"
          >
            <SettingsIcon width={15} height={15} />
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={onRespawnSelf}
            title="Respawn yourself to active Checkpoint (C)"
          >
            CP [C]
          </button>
          {isHost && (
            <button
              type="button"
              className="hud-btn"
              onClick={onRestartLevel}
              title="Host: Restart full stage (R)"
            >
              <RestartIcon />
              {!settings.cinemaMode && <span>Restart</span>}
            </button>
          )}
          {isHost && (
            <button type="button" className="hud-btn" onClick={onReturnLobby}>
              Menu
            </button>
          )}
        </div>
      </div>

      {/* Floating Bottom Control Hints, Quick Emotes, and Mobile Touch Controls */}
      <div className="floating-bottom-controls">
        {!settings.cinemaMode && (
          <div className="desktop-bottom-bar">
            <div className="desktop-hints-pill">
              <span>
                <code>A/D</code> Move
              </span>
              <span>
                <code>Space</code> Jump
              </span>
              <span>
                <code>S</code> Drop
              </span>
              {world.soloPractice && (
                <span>
                  <code>Tab</code> Swap · <code>Q</code> Follow
                </span>
              )}
              <span>
                <code>C</code> Checkpoint
              </span>
              <span>
                <code>F</code> Cinema
              </span>
              {isHost && (
                <span>
                  <code>R</code> Restart
                </span>
              )}
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
        )}

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
            <button
              type="button"
              className="touch-btn"
              title="Drop through platform"
              onPointerDown={(e) => {
                e.preventDefault();
                setTouchBit(INPUT_BITS.DOWN, true);
              }}
              onPointerUp={() => setTouchBit(INPUT_BITS.DOWN, false)}
              onPointerLeave={() => setTouchBit(INPUT_BITS.DOWN, false)}
              onPointerCancel={() => setTouchBit(INPUT_BITS.DOWN, false)}
            >
              ▼
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
                <span>Fill Screen (Edge-to-Edge)</span>
                <input
                  type="checkbox"
                  checked={settings.fillViewport}
                  onChange={(e) => onUpdateSettings({ fillViewport: e.target.checked })}
                />
              </label>
              <label className="setting-row surface">
                <span>Cinema Mode (Minimal HUD)</span>
                <input
                  type="checkbox"
                  checked={settings.cinemaMode}
                  onChange={(e) => onUpdateSettings({ cinemaMode: e.target.checked })}
                />
              </label>
              <label className="setting-row surface">
                <span>Sound Effects</span>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                />
              </label>
              <label className="setting-row surface">
                <span>Ambient Synth Music</span>
                <input
                  type="checkbox"
                  checked={settings.musicEnabled}
                  disabled={!settings.soundEnabled}
                  onChange={(e) => onUpdateSettings({ musicEnabled: e.target.checked })}
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

      {/* Chamber Cleared Victory Overlay with Medals, DarkCoins & Next Stage Progression */}
      {world.status === 'completed' && (
        <div className="victory-overlay">
          <div className="panel victory-card">
            <span className={`pill pill-medal-${world.medal ?? 'bronze'}`}>
              {world.modifier === 'low_gravity'
                ? `CHAOS CLEAR (UNRANKED) · ${activeLevel.name}`
                : `${(world.medal ?? 'bronze').toUpperCase()} MEDAL · ${activeLevel.name}`}
            </span>
            <h2 className="victory-title">TOGETHER!</h2>
            <p className="victory-subtitle">
              {activeLevel.title} cleared! Gold par: {formatTimer(activeLevel.parTimeMs.gold)}
            </p>
            <div className="victory-stats victory-stats-3">
              <div className="surface stat-tile">
                <span className="muted-label">Time</span>
                <strong>{formatTimer(world.completionTimeMs ?? world.elapsedMs)}</strong>
              </div>
              <div className="surface stat-tile">
                <span className="muted-label">DarkCoins</span>
                <strong>
                  {collectedCoins}/{totalCoins}
                </strong>
              </div>
              <div className="surface stat-tile">
                <span className="muted-label">Falls</span>
                <strong>{world.respawnCount}</strong>
              </div>
            </div>
            <div className="victory-actions">
              {!isHost && (
                <p className="muted-note" style={{ width: '100%', textAlign: 'center' }}>
                  Waiting for Host to launch next stage or return to menu...
                </p>
              )}
              {isHost && nextCampaignId && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onStartNextLevel(nextCampaignId)}
                >
                  Next: {nextCampaignLevel?.code ?? 'Stage'} →
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
              {isHost && (
                <button
                  type="button"
                  className={`btn ${nextCampaignId || isProcedural ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={onRestartLevel}
                >
                  Replay
                </button>
              )}
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
