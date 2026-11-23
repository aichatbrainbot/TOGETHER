import {
  type ColorblindShape,
  EMOTE_PINGS,
  type EmotePingId,
  type GameWorldState,
  LEVEL_CHAMBER_01,
  type LevelDefinition,
  PHYSICS,
  type SimEvent,
  type SimPlayerState,
  THEME_COLORS,
  getPaletteForSlot,
} from '@together/game-core';

type ParticleKind = 'square' | 'ring' | 'spark';

interface PooledParticle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity: number;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

interface PlayerJuiceState {
  scaleX: number;
  scaleY: number;
  wasGrounded: boolean;
  lastVy: number;
  runDustTimer: number;
  flashTimer: number;
  trail: [TrailPoint, TrailPoint, TrailPoint];
  trailTimer: number;
}

export interface RenderedPlayerPose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
}

export interface ActiveEmote {
  emote: EmotePingId;
  expiresAt: number;
}

const EMOTE_LABEL_MAP = new Map<EmotePingId, string>(EMOTE_PINGS.map((e) => [e.id, e.label]));
const PARTICLE_POOL_SIZE = 220;

/**
 * High-performance 60 FPS Canvas2D pixel-art renderer inspired by LittleJS / Celeste game feel:
 *  - ZERO ctx.shadowBlur (fast layered translucent pixel halos)
 *  - Pre-allocated fixed Object Pool (220 particles, 0 GC allocation churn)
 *  - Offscreen Static Layer Cache (1 blit per frame for sky, grid, watermark, walls & one-way decks)
 *  - Foot-anchored Squash & Stretch, running dust, fast-fall/bounce afterimages, shockwave rings & trauma shake
 */
export class GameRenderer {
  private readonly pool: PooledParticle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    kind: 'square',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 2,
    color: '#FFFFFF',
    life: 0,
    maxLife: 0.3,
    gravity: 300,
  }));
  private readonly juiceByPlayerId = new Map<string, PlayerJuiceState>();
  private animTime = 0;
  private trauma = 0;
  private coinSparkleTimer = 0;

  private staticCache: HTMLCanvasElement | null = null;
  private staticCacheKey = '';

  spawnLocalJumpEffect(x: number, y: number, color: string): void {
    this.burst(x, y, color, 5, 44, -26, 0.24, 180);
  }

  triggerShake(traumaAmount: number): void {
    // Trauma accumulates cleanly up to 1.0 (Squirrel Eiserloh Game-Feel formula)
    this.trauma = Math.min(1, this.trauma + Math.max(0, traumaAmount));
  }

  spawnEventParticles(events: readonly SimEvent[], ignoreJumpForId?: string): void {
    for (const ev of events) {
      const color = ev.color ?? THEME_COLORS.primaryAccent;
      switch (ev.type) {
        case 'jump':
          if (ignoreJumpForId && ev.playerId === ignoreJumpForId) break;
          this.burst(ev.x, ev.y, color, 5, 44, -26, 0.24, 180);
          break;
        case 'land':
          this.burst(ev.x, ev.y, '#9AA6C7', 4, 38, -14, 0.18, 160);
          break;
        case 'bounce':
          this.burst(ev.x, ev.y, color, 14, 92, -118, 0.4, 240);
          this.spawnRing(ev.x, ev.y, color, 26, 0.32);
          this.triggerShake(0.45);
          if (ev.playerId) this.triggerPlayerFlash(ev.playerId, 0.08);
          break;
        case 'crumble':
          this.burst(ev.x, ev.y, '#FFB84D', 12, 85, -35, 0.44, 340);
          this.triggerShake(0.28);
          break;
        case 'checkpoint':
          this.burst(ev.x, ev.y, '#4FF0D6', 18, 95, -95, 0.55, 220);
          this.spawnRing(ev.x, ev.y, '#4FF0D6', 32, 0.45);
          break;
        case 'coin_pickup':
          this.burst(ev.x, ev.y, '#FFE066', 14, 96, -86, 0.46, 200);
          this.spawnRing(ev.x, ev.y, '#FFE066', 24, 0.34);
          if (ev.playerId) this.triggerPlayerFlash(ev.playerId, 0.07);
          break;
        case 'switch_on':
          this.burst(ev.x, ev.y, color, 8, 65, -55, 0.32, 240);
          break;
        case 'bridge_on':
        case 'bridge_lock':
          this.burst(ev.x, ev.y, '#4FF0D6', 14, 95, -55, 0.42, 220);
          this.spawnRing(ev.x, ev.y, '#4FF0D6', 28, 0.35);
          break;
        case 'key_pickup':
          this.burst(ev.x, ev.y, '#FFD166', 16, 85, -70, 0.48, 200);
          this.spawnRing(ev.x, ev.y, '#FFD166', 26, 0.36);
          break;
        case 'gate_unlock':
          this.burst(ev.x, ev.y, color, 18, 105, -65, 0.52, 240);
          this.spawnRing(ev.x, ev.y, color, 34, 0.4);
          this.triggerShake(0.5);
          break;
        case 'door_unlock':
          this.burst(ev.x, ev.y, '#4FF0D6', 22, 115, -70, 0.58, 220);
          this.spawnRing(ev.x, ev.y, '#4FF0D6', 42, 0.48);
          this.triggerShake(0.55);
          break;
        case 'respawn':
          this.burst(ev.x, ev.y, '#FF4D6D', 16, 100, -65, 0.45, 280);
          this.spawnRing(ev.x, ev.y, '#FF4D6D', 26, 0.34);
          this.triggerShake(0.65);
          if (ev.playerId) this.triggerPlayerFlash(ev.playerId, 0.08);
          break;
        case 'level_complete':
          this.burst(ev.x, ev.y, '#A28BFF', 24, 145, -105, 0.82, 190);
          this.burst(ev.x, ev.y, '#4FF0D6', 24, 145, -115, 0.88, 190);
          this.spawnRing(ev.x, ev.y, '#4FF0D6', 54, 0.55);
          this.triggerShake(0.6);
          break;
      }
    }
  }

  private triggerPlayerFlash(playerId: string, durationSec: number): void {
    const j = this.juiceByPlayerId.get(playerId);
    if (j) j.flashTimer = Math.max(j.flashTimer, durationSec);
  }

  resetEffects(): void {
    for (const pt of this.pool) pt.active = false;
    this.juiceByPlayerId.clear();
    this.trauma = 0;
  }

  render(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    posesByPlayerId: ReadonlyMap<string, RenderedPlayerPose>,
    localUserId: string,
    dtSec: number,
    options: {
      level?: LevelDefinition;
      viewportWidth?: number;
      viewportHeight?: number;
      fillViewport?: boolean;
      showPlayerNames?: boolean;
      colorblindShapes?: boolean;
      highContrast?: boolean;
      reducedMotion?: boolean;
      emotesByPlayerId?: ReadonlyMap<string, ActiveEmote>;
      nowMs?: number;
    } = {},
  ): void {
    const level = options.level ?? LEVEL_CHAMBER_01;
    const viewW = options.viewportWidth ?? level.width;
    const viewH = options.viewportHeight ?? level.height;
    const fillViewport = options.fillViewport ?? true;
    const showNames = options.showPlayerNames ?? true;
    const colorblindShapes = options.colorblindShapes ?? false;
    const highContrast = options.highContrast ?? false;
    const reducedMotion = options.reducedMotion ?? false;
    const emotes = options.emotesByPlayerId;
    const nowMs = options.nowMs ?? Date.now();

    this.animTime += reducedMotion ? dtSec * 0.25 : dtSec;
    this.updateParticles(dtSec);

    if (reducedMotion) {
      this.trauma = 0;
    } else if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 2.6 * dtSec);
    }

    // Gentle ambient sparkles on uncollected DarkCoins
    if (!reducedMotion && (level.coins?.length ?? 0) > 0) {
      this.coinSparkleTimer += dtSec;
      if (this.coinSparkleTimer >= 0.38) {
        this.coinSparkleTimer = 0;
        const coinDefs = level.coins!;
        const coinRt = world.coins ?? [];
        for (let i = 0; i < coinDefs.length; i += 1) {
          if (coinRt[i]?.collected) continue;
          const cd = coinDefs[i]!;
          this.spawnSingleParticle(
            cd.x + (Math.random() - 0.5) * 12,
            cd.y + (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 14,
            -22 - Math.random() * 14,
            2,
            '#FFF5B8',
            0.38,
            -10,
          );
        }
      }
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const uniformScale = Math.min(viewW / level.width, viewH / level.height);
    let scaleX = uniformScale;
    let scaleY = uniformScale;
    if (fillViewport) {
      const rawScaleX = viewW / level.width;
      const rawScaleY = viewH / level.height;
      const aspectRatioDiff = Math.max(rawScaleX / rawScaleY, rawScaleY / rawScaleX);
      if (aspectRatioDiff <= 1.18) {
        scaleX = rawScaleX;
        scaleY = rawScaleY;
      }
    }

    const drawW = level.width * scaleX;
    const drawH = level.height * scaleY;
    const shake = this.trauma * this.trauma;
    const shakeX = shake > 0.005 ? Math.round(8 * shake * Math.sin(this.animTime * 48 * 1.7)) : 0;
    const shakeY = shake > 0.005 ? Math.round(6 * shake * Math.cos(this.animTime * 48 * 2.3)) : 0;
    const offsetX = Math.floor((viewW - drawW) / 2) + shakeX;
    const offsetY = Math.floor((viewH - drawH) / 2) + shakeY;

    if (offsetX > 0 || offsetY > 0 || drawW < viewW || drawH < viewH || shake > 0.005) {
      ctx.fillStyle = '#090B12';
      ctx.fillRect(0, 0, viewW, viewH);
    }

    ctx.translate(offsetX, offsetY);
    ctx.scale(scaleX, scaleY);

    // 1. Single-blit cached static layer
    const staticCanvas = this.getOrBuildStaticLayer(level, highContrast);
    if (staticCanvas) {
      ctx.drawImage(staticCanvas, 0, 0);
    } else {
      this.drawBackground(ctx, level);
      this.drawSolids(ctx, level, highContrast);
      this.drawOneWayPlatforms(ctx, level);
    }

    // 2. Crisp diegetic hint stencils
    this.drawChamberCues(ctx, level, world);

    // 3. Glowing circuit wires (zero shadowBlur)
    this.drawWires(ctx, level, world);

    // 4. Crumbling warning platforms
    this.drawCrumblePlatforms(ctx, level, world);

    // 5. Bright crimson plasma hazard pits
    this.drawHazards(ctx, level);

    // 6. Retractable & timed neon energy bridges
    this.drawBridges(ctx, level, world);

    // 7. Moving platforms & guide tracks
    this.drawMovingPlatforms(ctx, level, world, highContrast);

    // 8. Bounce / Spring pads
    this.drawBouncePads(ctx, level);

    // 9. Checkpoints
    this.drawCheckpoints(ctx, level, world);

    // 10. Switch-controlled laser beams
    this.drawLasers(ctx, level, world);

    // 11. Locked security gates
    this.drawLockedGates(ctx, level, world);

    // 12. Cooperative switches (with live 0/2 team counter badges!)
    this.drawSwitches(ctx, level, world);

    // 13. High-contrast Amber x1 & Violet x2 cooperative push crates
    this.drawCrates(ctx, level, world, highContrast);

    // 14. Exit door portal
    this.drawExitDoor(ctx, level, world);

    // 15. Optional Collectible DarkCoins (3 per stage!)
    this.drawCoins(ctx, level, world);

    // 16. Radiant gold keys
    this.drawKeys(ctx, level, world, posesByPlayerId);

    // 17. Animated squash/stretch players, speed afterimages, dust & emotes
    const controlledId = world.soloPractice ? (world.soloActiveId ?? localUserId) : localUserId;
    const ordered = [...world.players].sort((a, b) => {
      if (a.id === controlledId) return 1;
      if (b.id === controlledId) return -1;
      return a.slot - b.slot;
    });

    for (const player of ordered) {
      const pose = posesByPlayerId.get(player.id) ?? {
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        facing: player.facing,
        grounded: player.grounded,
      };
      const juice = this.updatePlayerJuice(player, pose, dtSec, reducedMotion);
      const activeEmote = emotes?.get(player.id);
      const emoteText =
        activeEmote && activeEmote.expiresAt > nowMs
          ? (EMOTE_LABEL_MAP.get(activeEmote.emote) ?? null)
          : null;

      this.drawPlayer(ctx, player, pose, juice, {
        isControlled: player.id === controlledId,
        soloPractice: world.soloPractice,
        showNames,
        colorblindShapes,
        highContrast,
        reducedMotion,
        emoteText,
      });
    }

    // 18. Pooled pixel particles & expanding shockwave rings
    if (!reducedMotion) {
      this.drawParticles(ctx);
    }

    ctx.restore();
  }

  private updatePlayerJuice(
    player: SimPlayerState,
    pose: RenderedPlayerPose,
    dtSec: number,
    reducedMotion: boolean,
  ): PlayerJuiceState {
    let j = this.juiceByPlayerId.get(player.id);
    if (!j) {
      j = {
        scaleX: 1,
        scaleY: 1,
        wasGrounded: pose.grounded,
        lastVy: pose.vy,
        runDustTimer: 0,
        flashTimer: 0,
        trail: [
          { x: pose.x, y: pose.y, alpha: 0 },
          { x: pose.x, y: pose.y, alpha: 0 },
          { x: pose.x, y: pose.y, alpha: 0 },
        ],
        trailTimer: 0,
      };
      this.juiceByPlayerId.set(player.id, j);
    }

    if (j.flashTimer > 0) {
      j.flashTimer = Math.max(0, j.flashTimer - dtSec);
    }

    if (reducedMotion || !player.connected) {
      j.scaleX = 1;
      j.scaleY = 1;
      j.flashTimer = 0;
      j.wasGrounded = pose.grounded;
      return j;
    }

    // Takeoff stretch impulse
    if (j.wasGrounded && !pose.grounded && pose.vy < -160) {
      j.scaleX = pose.vy < -520 ? 0.72 : 0.8;
      j.scaleY = pose.vy < -520 ? 1.34 : 1.24;
    }

    // Impact squash + dust puff upon landing
    if (!j.wasGrounded && pose.grounded) {
      const heavy = j.lastVy > 340;
      j.scaleX = heavy ? 1.28 : 1.18;
      j.scaleY = heavy ? 0.74 : 0.84;
      this.burst(
        pose.x + PHYSICS.PLAYER_WIDTH / 2,
        pose.y + PHYSICS.PLAYER_HEIGHT,
        '#BAC4DE',
        heavy ? 6 : 3,
        heavy ? 48 : 30,
        -22,
        0.2,
        140,
      );
    }

    // Running foot dust puffs
    if (pose.grounded && Math.abs(pose.vx) > 95) {
      j.runDustTimer += dtSec;
      if (j.runDustTimer >= 0.11) {
        j.runDustTimer = 0;
        this.spawnSingleParticle(
          pose.x + (pose.facing > 0 ? 3 : PHYSICS.PLAYER_WIDTH - 3),
          pose.y + PHYSICS.PLAYER_HEIGHT - 1,
          -pose.facing * (12 + Math.random() * 14),
          -14 - Math.random() * 12,
          2,
          '#9AA6C7',
          0.22,
          60,
        );
      }
    } else {
      j.runDustTimer = 0.06;
    }

    // Fast-motion afterimage trail (bounce pads / fast falls)
    const fastAir = !pose.grounded && (Math.abs(pose.vy) > 420 || Math.hypot(pose.vx, pose.vy) > 460);
    for (const tp of j.trail) {
      if (tp.alpha > 0) tp.alpha = Math.max(0, tp.alpha - dtSec * 3.2);
    }
    if (fastAir) {
      j.trailTimer += dtSec;
      if (j.trailTimer >= 0.032) {
        j.trailTimer = 0;
        j.trail[2] = { ...j.trail[1] };
        j.trail[1] = { ...j.trail[0] };
        j.trail[0] = { x: pose.x, y: pose.y, alpha: 0.45 };
      }
    }

    const recover = 1 - Math.exp(-18 * dtSec);
    j.scaleX += (1 - j.scaleX) * recover;
    j.scaleY += (1 - j.scaleY) * recover;
    j.wasGrounded = pose.grounded;
    j.lastVy = pose.vy;
    return j;
  }

  private getOrBuildStaticLayer(
    level: LevelDefinition,
    highContrast: boolean,
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const key = `${level.id}:${level.width}x${level.height}:${highContrast ? 'hc' : 'std'}`;
    if (this.staticCache && this.staticCacheKey === key) {
      return this.staticCache;
    }

    const canvas = this.staticCache ?? document.createElement('canvas');
    canvas.width = level.width;
    canvas.height = level.height;
    const sctx = canvas.getContext('2d', { alpha: false });
    if (!sctx) return null;

    sctx.imageSmoothingEnabled = false;
    this.drawBackground(sctx, level);
    this.drawSolids(sctx, level, highContrast);
    this.drawOneWayPlatforms(sctx, level);

    this.staticCache = canvas;
    this.staticCacheKey = key;
    return canvas;
  }

  private drawBackground(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    const bg = ctx.createLinearGradient(0, 0, 0, level.height);
    bg.addColorStop(0, '#0B0D16');
    bg.addColorStop(0.6, '#111626');
    bg.addColorStop(1, '#0E1220');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, level.width, level.height);

    const gradLeft = ctx.createRadialGradient(230, 260, 14, 230, 260, 260);
    gradLeft.addColorStop(0, `${level.themeAccent}18`);
    gradLeft.addColorStop(1, 'rgba(11, 13, 22, 0)');
    ctx.fillStyle = gradLeft;
    ctx.fillRect(0, 0, level.width, level.height);

    const gradRight = ctx.createRadialGradient(660, 310, 14, 660, 310, 250);
    gradRight.addColorStop(0, 'rgba(84, 214, 197, 0.10)');
    gradRight.addColorStop(1, 'rgba(11, 13, 22, 0)');
    ctx.fillStyle = gradRight;
    ctx.fillRect(0, 0, level.width, level.height);

    ctx.strokeStyle = 'rgba(56, 68, 98, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 32; x < level.width; x += 32) {
      ctx.moveTo(x + 0.5, 24);
      ctx.lineTo(x + 0.5, level.height);
    }
    for (let y = 32; y < level.height; y += 32) {
      ctx.moveTo(24, y + 0.5);
      ctx.lineTo(level.width - 24, y + 0.5);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(230, 234, 242, 0.06)';
    ctx.font = '900 62px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(level.code, 42, 96);
  }

  private drawChamberCues(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const swMap = new Map(world.switches.map((s) => [s.id, s]));
    ctx.font = '800 10px monospace';
    ctx.textAlign = 'center';

    for (const cue of level.cues) {
      if (cue.hideWhenUnlocked && world.exitDoor.unlocked) continue;
      if (cue.hideWhenSwitchLatched && swMap.get(cue.hideWhenSwitchLatched)?.latched) continue;
      const color =
        cue.accent === 'mint'
          ? 'rgba(79, 240, 214, 0.86)'
          : cue.accent === 'amber'
            ? 'rgba(255, 200, 97, 0.88)'
            : 'rgba(180, 155, 255, 0.88)';
      ctx.fillStyle = 'rgba(11, 13, 22, 0.68)';
      const tw = ctx.measureText(cue.text).width;
      ctx.fillRect(cue.x - tw / 2 - 4, cue.y - 10, tw + 8, 13);
      ctx.fillStyle = color;
      ctx.fillText(cue.text, cue.x, cue.y);
    }
  }

  private drawWires(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const swMap = new Map(world.switches.map((s) => [s.id, s]));
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    for (const wire of level.wires) {
      const sw = swMap.get(wire.linkedTo);
      const isLit =
        wire.linkedTo === 'exit'
          ? world.exitDoor.unlocked
          : Boolean(sw?.pressed || sw?.latched || (sw && sw.remainingTicks > 0));

      const accent =
        wire.accent === 'mint'
          ? '#4FF0D6'
          : wire.accent === 'amber'
            ? '#FFB84D'
            : wire.accent === 'danger'
              ? '#FF5C80'
              : '#B49BFF';

      ctx.beginPath();
      for (let i = 0; i < wire.points.length; i += 1) {
        const pt = wire.points[i]!;
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }

      ctx.strokeStyle = '#181E30';
      ctx.lineWidth = 4;
      ctx.stroke();

      if (isLit) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
      }

      ctx.strokeStyle = isLit ? accent : '#384363';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawSolids(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    highContrast: boolean,
  ): void {
    const trim = level.themeAccent;
    for (const rect of level.solids) {
      ctx.fillStyle = '#28314A';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      for (let tx = rect.x; tx < rect.x + rect.w; tx += 16) {
        for (let ty = rect.y; ty < rect.y + rect.h; ty += 16) {
          const bw = Math.min(16, rect.x + rect.w - tx);
          const bh = Math.min(16, rect.y + rect.h - ty);
          ctx.fillStyle = '#333F5E';
          ctx.fillRect(tx + 1, ty + 1, bw - 2, 1);
          ctx.strokeStyle = '#181E30';
          ctx.lineWidth = 1;
          ctx.strokeRect(tx + 0.5, ty + 0.5, bw - 1, bh - 1);
        }
      }

      ctx.strokeStyle = highContrast ? '#E6EAF2' : '#45547A';
      ctx.lineWidth = highContrast ? 1.5 : 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      if (rect.y > 0) {
        ctx.fillStyle = trim;
        ctx.fillRect(rect.x, rect.y, rect.w, 4);
        ctx.fillStyle = 'rgba(235, 242, 255, 0.72)';
        ctx.fillRect(rect.x, rect.y, rect.w, 1);
      }
    }
  }

  private drawOneWayPlatforms(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    for (const ow of level.oneWayPlatforms ?? []) {
      ctx.fillStyle = '#1F2C42';
      ctx.fillRect(ow.x, ow.y, ow.w, ow.h);
      ctx.fillStyle = '#67E8F9';
      ctx.fillRect(ow.x, ow.y, ow.w, 3);
      ctx.fillStyle = '#9CEEFF';
      for (let x = ow.x + 10; x < ow.x + ow.w - 8; x += 18) {
        ctx.fillRect(x, ow.y + 6, 6, 1);
        ctx.fillRect(x + 2, ow.y + 5, 2, 1);
      }
    }
  }

  private drawCrumblePlatforms(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const defs = level.crumblePlatforms ?? [];
    for (let i = 0; i < defs.length; i += 1) {
      const def = defs[i]!;
      const st = world.crumblePlatforms[i];
      if (!st) continue;

      if (st.state === 'gone') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 184, 77, 0.35)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(def.x + 1, def.y + 1, def.w - 2, def.h - 2);
        ctx.restore();
        continue;
      }

      const jitterX = st.state === 'shaking' ? Math.round(Math.sin(this.animTime * 60) * 2) : 0;
      const x = def.x + jitterX;
      const y = def.y;

      ctx.fillStyle = st.state === 'shaking' ? '#52341C' : '#3C2E22';
      ctx.fillRect(x, y, def.w, def.h);
      ctx.strokeStyle = st.state === 'shaking' ? '#FF7B3D' : '#F5A623';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, def.w - 1, def.h - 1);

      ctx.fillStyle = st.state === 'shaking' ? '#FF7B3D' : '#FFD166';
      ctx.fillRect(x + 1, y + 1, def.w - 2, 3);

      ctx.fillStyle = '#18120C';
      ctx.fillRect(x + Math.round(def.w * 0.35), y + 4, 2, def.h - 5);
      ctx.fillRect(x + Math.round(def.w * 0.68), y + 5, 2, def.h - 6);
    }
  }

  private drawBouncePads(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    for (const pad of level.bouncePads ?? []) {
      const color = pad.accent === 'amber' ? '#FFB84D' : '#4FF0D6';
      const halo = pad.accent === 'amber' ? 'rgba(255, 184, 77, 0.25)' : 'rgba(79, 240, 214, 0.25)';
      const pulse = Math.round(Math.sin(this.animTime * 6) * 1);

      ctx.fillStyle = '#20263A';
      ctx.fillRect(pad.x, pad.y + 5, pad.w, pad.h - 5);

      ctx.fillStyle = '#9AA6C7';
      ctx.fillRect(pad.x + 6, pad.y + 3, 3, 4);
      ctx.fillRect(pad.x + pad.w - 9, pad.y + 3, 3, 4);

      ctx.fillStyle = halo;
      ctx.fillRect(pad.x - 3, pad.y + pulse - 2, pad.w + 6, 8);
      ctx.fillStyle = color;
      ctx.fillRect(pad.x - 1, pad.y + pulse, pad.w + 2, 4);
      ctx.fillStyle = '#E6EAF2';
      ctx.fillRect(pad.x + 2, pad.y + pulse, pad.w - 4, 1);
    }
  }

  private drawCheckpoints(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    for (const cp of level.checkpoints ?? []) {
      const active = world.activeCheckpointId === cp.id;
      const poleX = cp.x + 6;
      ctx.fillStyle = active ? '#E6EAF2' : '#586485';
      ctx.fillRect(poleX, cp.y + 4, 3, cp.h - 4);
      ctx.fillStyle = '#2E3854';
      ctx.fillRect(cp.x + 2, cp.y + cp.h - 4, 12, 4);

      const wave = active ? Math.round(Math.sin(this.animTime * 7) * 1.5) : 0;
      if (active) {
        ctx.fillStyle = 'rgba(79, 240, 214, 0.24)';
        ctx.fillRect(poleX + 1, cp.y + 3, 15, 12 + wave);
      }
      ctx.fillStyle = active ? '#4FF0D6' : '#3C4766';
      ctx.fillRect(poleX + 3, cp.y + 5, 11, 8 + wave);
      ctx.fillStyle = active ? '#101116' : '#717E9E';
      ctx.font = '800 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(active ? 'CP' : '·', poleX + 8, cp.y + 12);
    }
  }

  private drawLasers(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const defs = level.lasers ?? [];
    for (let i = 0; i < defs.length; i += 1) {
      const def = defs[i]!;
      const state = world.lasers[i];
      const active = state ? state.active : true;

      ctx.fillStyle = '#333F5E';
      ctx.fillRect(def.x - 3, def.y, def.w + 6, 6);
      ctx.fillRect(def.x - 3, def.y + def.h - 6, def.w + 6, 6);

      if (!active) {
        ctx.fillStyle = '#4FF0D6';
        ctx.fillRect(def.x, def.y + 2, def.w, 2);
        ctx.fillRect(def.x, def.y + def.h - 4, def.w, 2);
        continue;
      }

      ctx.fillStyle = 'rgba(255, 59, 107, 0.24)';
      ctx.fillRect(def.x - 4, def.y + 5, def.w + 8, def.h - 10);
      ctx.fillStyle = '#FF3B6B';
      ctx.fillRect(def.x, def.y + 5, def.w, def.h - 10);
      const corePulse = 0.75 + 0.25 * Math.sin(this.animTime * 22);
      ctx.fillStyle = `rgba(255, 224, 234, ${corePulse.toFixed(2)})`;
      ctx.fillRect(def.x + 2, def.y + 5, Math.max(2, def.w - 4), def.h - 10);
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    const pulse = 0.75 + 0.25 * Math.sin(this.animTime * 5);
    for (const h of level.hazards) {
      ctx.fillStyle = '#2B0D18';
      ctx.fillRect(h.x, h.y, h.w, h.h);

      ctx.fillStyle = 'rgba(255, 59, 107, 0.22)';
      ctx.fillRect(h.x, h.y - 2, h.w, 12);

      ctx.fillStyle = `rgba(255, 59, 107, ${pulse.toFixed(2)})`;
      ctx.fillRect(h.x, h.y + 4, h.w, 5);

      ctx.fillStyle = '#FF8FA3';
      for (let sx = h.x + 2; sx < h.x + h.w - 6; sx += 12) {
        const waveY = Math.round(Math.sin(this.animTime * 4.5 + sx * 0.14) * 1.5);
        ctx.fillRect(sx, h.y + 1 + waveY, 6, 3);
        ctx.fillRect(sx + 2, h.y - 1 + waveY, 2, 2);
      }
    }
  }

  private drawBridges(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    for (let i = 0; i < level.bridges.length; i += 1) {
      const def = level.bridges[i]!;
      const state = world.bridges[i];
      const active = Boolean(state?.active);
      const locked = Boolean(state?.locked);
      const color = locked ? '#4FF0D6' : '#B49BFF';

      ctx.fillStyle = '#36415E';
      ctx.fillRect(def.x - 4, def.y - 2, 6, def.h + 4);
      ctx.fillRect(def.x + def.w - 2, def.y - 2, 6, def.h + 4);
      ctx.fillStyle = active ? color : '#526085';
      ctx.fillRect(def.x - 2, def.y + 3, 2, def.h - 6);
      ctx.fillRect(def.x + def.w, def.y + 3, 2, def.h - 6);

      if (!active) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 155, 255, 0.42)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(def.x + 1, def.y + 1, def.w - 2, def.h - 2);
        ctx.restore();
        continue;
      }

      ctx.fillStyle = locked ? 'rgba(79, 240, 214, 0.16)' : 'rgba(180, 155, 255, 0.16)';
      ctx.fillRect(def.x - 2, def.y - 3, def.w + 4, def.h + 6);

      ctx.fillStyle = locked ? 'rgba(79, 240, 214, 0.36)' : 'rgba(180, 155, 255, 0.36)';
      ctx.fillRect(def.x, def.y, def.w, def.h);

      ctx.fillStyle = color;
      ctx.fillRect(def.x, def.y, def.w, 4);
      ctx.fillRect(def.x, def.y + def.h - 2, def.w, 2);

      if (state && state.maxTicks > 0 && !locked) {
        const ratio = Math.max(0, Math.min(1, state.remainingTicks / state.maxTicks));
        ctx.fillStyle = ratio < 0.25 ? '#FF6B8B' : '#FFD166';
        ctx.fillRect(def.x + 2, def.y + 5, Math.round((def.w - 4) * ratio), 5);
      } else {
        const shimmerOffset = Math.floor(this.animTime * 48) % 16;
        ctx.fillStyle = 'rgba(235, 242, 255, 0.42)';
        for (let bx = def.x + shimmerOffset; bx < def.x + def.w - 4; bx += 16) {
          ctx.fillRect(bx, def.y + 6, 6, 4);
        }
      }
    }
  }

  private drawMovingPlatforms(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
    highContrast: boolean,
  ): void {
    for (let i = 0; i < level.movingPlatforms.length; i += 1) {
      const def = level.movingPlatforms[i]!;
      const mp = world.movingPlatforms[i]!;
      const accent =
        def.accent === 'sky' ? '#38BDF8' : def.accent === 'mint' ? '#4FF0D6' : '#B49BFF';

      ctx.save();
      ctx.strokeStyle = mp.active ? `${accent}55` : 'rgba(147, 155, 178, 0.22)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(def.startX + def.w / 2, def.startY + def.h / 2);
      ctx.lineTo(def.endX + def.w / 2, def.endY + def.h / 2);
      ctx.stroke();
      ctx.restore();

      const x = Math.round(mp.x);
      const y = Math.round(mp.y);

      ctx.fillStyle = '#2B3654';
      ctx.fillRect(x, y, mp.w, mp.h);
      ctx.strokeStyle = highContrast ? '#E6EAF2' : mp.active ? accent : '#647499';
      ctx.lineWidth = highContrast ? 2 : 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, mp.w - 1, mp.h - 1);

      ctx.fillStyle = mp.active ? accent : '#647499';
      ctx.fillRect(x + 1, y + 1, mp.w - 2, 4);

      if (mp.active) {
        const flicker = 2 + Math.round(Math.abs(Math.sin(this.animTime * 16)) * 2);
        ctx.fillStyle = accent;
        ctx.fillRect(x + 7, y + mp.h, 5, flicker);
        ctx.fillRect(x + mp.w - 12, y + mp.h, 5, flicker);
      }
    }
  }

  private drawLockedGates(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    for (let i = 0; i < level.lockedGates.length; i += 1) {
      const def = level.lockedGates[i]!;
      const gate = world.lockedGates[i];
      const accent =
        def.accent === 'amber' ? '#FFB84D' : def.accent === 'mint' ? '#4FF0D6' : '#B49BFF';

      if (gate?.unlocked) {
        ctx.fillStyle = '#333F5E';
        ctx.fillRect(def.x, def.y, def.w, 6);
        ctx.fillRect(def.x, def.y + def.h - 6, def.w, 6);
        ctx.fillStyle = accent;
        ctx.fillRect(def.x + 4, def.y + 4, def.w - 8, 2);
        continue;
      }

      ctx.fillStyle = '#232B42';
      ctx.fillRect(def.x, def.y, def.w, def.h);
      ctx.fillStyle = `${accent}33`;
      ctx.fillRect(def.x - 2, def.y + 2, def.w + 4, def.h - 4);
      ctx.fillStyle = accent;
      ctx.fillRect(def.x + 4, def.y + 4, def.w - 8, def.h - 8);

      const cy = def.y + def.h / 2;
      ctx.fillStyle = '#0D101B';
      ctx.fillRect(def.x + 1, cy - 9, def.w - 2, 18);
      ctx.fillStyle = '#FFD166';
      ctx.fillRect(def.x + 5, cy - 5, 6, 4);
      ctx.fillRect(def.x + 7, cy - 1, 2, 6);
    }
  }

  private drawCrates(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
    highContrast: boolean,
  ): void {
    for (let i = 0; i < level.crates.length; i += 1) {
      const def = level.crates[i]!;
      const c = world.crates[i]!;
      const x = Math.round(c.x);
      const y = Math.round(c.y);
      const isHeavy = def.accent === 'violet';
      const accent = isHeavy ? '#C084FC' : '#F5A623';
      const bodyFill = isHeavy ? '#3B2854' : '#4A361C';
      const braceFill = isHeavy ? '#281B3B' : '#332412';
      const effectiveReq = world.soloPractice ? 1 : c.requiredPushers;
      const isBeingPushedEnough = c.activePushers >= effectiveReq;

      if (isBeingPushedEnough) {
        ctx.fillStyle = `${accent}30`;
        ctx.fillRect(x - 3, y - 3, c.w + 6, c.h + 6);
      }

      ctx.fillStyle = bodyFill;
      ctx.fillRect(x, y, c.w, c.h);

      ctx.strokeStyle = braceFill;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + c.w - 4, y + c.h - 4);
      ctx.moveTo(x + c.w - 4, y + 4);
      ctx.lineTo(x + 4, y + c.h - 4);
      ctx.stroke();

      ctx.strokeStyle = highContrast ? '#E6EAF2' : accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, c.w - 2, c.h - 2);

      ctx.fillStyle = '#E6EAF2';
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + c.w - 5, y + 3, 2, 2);
      ctx.fillRect(x + 3, y + c.h - 5, 2, 2);
      ctx.fillRect(x + c.w - 5, y + c.h - 5, 2, 2);

      ctx.fillStyle = 'rgba(11, 13, 22, 0.88)';
      ctx.fillRect(x + 4, y + c.h / 2 - 6, c.w - 8, 12);
      ctx.fillStyle = isBeingPushedEnough ? '#4FF0D6' : accent;
      ctx.font = '800 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`x${effectiveReq}`, x + c.w / 2, y + c.h / 2 + 3);

      if (effectiveReq === 2 && c.activePushers === 1) {
        ctx.fillStyle = '#FFD166';
        ctx.font = '800 8px monospace';
        ctx.fillText('1/2 PUSH', x + c.w / 2, y - 5);
      }
    }
  }

  private drawCoins(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const defs = level.coins ?? [];
    const runtime = world.coins ?? [];
    for (let i = 0; i < defs.length; i += 1) {
      const def = defs[i]!;
      const st = runtime[i];
      if (st?.collected) continue;

      const bob = Math.round(Math.sin(this.animTime * 4.2 + i * 1.4) * 2.5);
      const spin = Math.max(0.35, Math.abs(Math.cos(this.animTime * 3.4 + i)));
      const cx = Math.round(def.x);
      const cy = Math.round(def.y + bob);
      const halfW = Math.max(2, Math.round(5.5 * spin));

      // Subtle glowing halo (zero shadowBlur)
      ctx.fillStyle = 'rgba(255, 224, 102, 0.2)';
      ctx.fillRect(cx - halfW - 3, cy - 8, (halfW + 3) * 2, 16);

      // Dark pixel rim + Obsidian-Gold DarkCoin face
      ctx.fillStyle = '#0B0D16';
      ctx.fillRect(cx - halfW - 1, cy - 6, (halfW + 1) * 2, 12);

      ctx.fillStyle = '#FFE066';
      ctx.fillRect(cx - halfW, cy - 5, halfW * 2, 10);

      // Inner dark-violet crescent emblem distinguishing DarkCoins
      ctx.fillStyle = '#33245C';
      ctx.fillRect(cx - Math.max(1, halfW - 2), cy - 3, Math.max(2, (halfW - 2) * 2), 6);
      ctx.fillStyle = '#FFF5B8';
      ctx.fillRect(cx - 1, cy - 2, 2, 4);
    }
  }

  private drawKeys(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
    posesByPlayerId: ReadonlyMap<string, RenderedPlayerPose>,
  ): void {
    for (let i = 0; i < level.keys.length; i += 1) {
      const key = world.keys[i]!;
      if (key.used) continue;

      const bob = Math.round(Math.sin(this.animTime * 4 + i) * 2.5);
      const kx = Math.round(key.x);
      const ky = Math.round(key.y + bob);

      if (key.carrierPlayerId) {
        const carrierPose = posesByPlayerId.get(key.carrierPlayerId);
        if (carrierPose) {
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(carrierPose.x + PHYSICS.PLAYER_WIDTH / 2, carrierPose.y + 8);
          ctx.stroke();
        }
      }

      ctx.fillStyle = 'rgba(255, 209, 102, 0.24)';
      ctx.fillRect(kx - 9, ky - 7, 22, 13);

      ctx.fillStyle = '#0B0D16';
      ctx.fillRect(kx - 7, ky - 5, 9, 9);
      ctx.fillRect(kx + 1, ky - 2, 10, 4);
      ctx.fillStyle = '#FFD166';
      ctx.fillRect(kx - 6, ky - 4, 7, 7);
      ctx.fillStyle = '#0B0D16';
      ctx.fillRect(kx - 4, ky - 2, 3, 3);
      ctx.fillStyle = '#FFD166';
      ctx.fillRect(kx + 1, ky - 1, 9, 2);
      ctx.fillRect(kx + 5, ky + 1, 2, 3);
      ctx.fillRect(kx + 8, ky + 1, 2, 3);
    }
  }

  private drawSwitches(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    for (let i = 0; i < level.switches.length; i += 1) {
      const def = level.switches[i]!;
      const state = world.switches[i];
      const active = Boolean(
        state?.pressed || state?.latched || (state && state.remainingTicks > 0),
      );
      const depressed = Boolean(state?.pressed || state?.latched);
      const accent =
        def.accent === 'mint' ? '#4FF0D6' : def.accent === 'amber' ? '#FFB84D' : '#B49BFF';

      ctx.fillStyle = '#181E30';
      ctx.fillRect(def.x - 2, def.y + def.h - 3, def.w + 4, 4);

      const plateY = depressed ? def.y + 3 : def.y;
      const plateH = depressed ? def.h - 3 : def.h;

      if (active) {
        ctx.fillStyle = `${accent}30`;
        ctx.fillRect(def.x - 3, plateY - 3, def.w + 6, plateH + 5);
      }

      ctx.fillStyle = active ? accent : '#647299';
      ctx.fillRect(def.x, plateY, def.w, plateH);
      ctx.fillStyle = '#E6EAF2';
      ctx.fillRect(def.x + 2, plateY, def.w - 4, 1);

      const reqP = state?.requiredPressers ?? (world.soloPractice ? 1 : (def.requiredPlayers ?? 1));
      if (reqP > 1 && !state?.latched) {
        const curP = Math.min(reqP, state?.pressers ?? 0);
        ctx.fillStyle = '#0B0D16';
        ctx.fillRect(def.x + def.w / 2 - 11, def.y - 12, 22, 10);
        ctx.fillStyle = curP >= reqP ? '#4FF0D6' : '#FFD166';
        ctx.font = '800 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${curP}/${reqP}`, def.x + def.w / 2, def.y - 4);
      }

      ctx.fillStyle = active ? accent : '#C4CEE6';
      ctx.font = '800 8px monospace';
      ctx.textAlign = 'center';
      const label =
        state?.latched
          ? 'LOCKED'
          : state && state.maxTicks > 0 && state.remainingTicks > 0
            ? `${(state.remainingTicks / PHYSICS.TICK_RATE).toFixed(1)}s`
            : def.label;
      ctx.fillText(label, def.x + def.w / 2, def.y + 18);
    }
  }

  private drawExitDoor(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const door = level.exitDoor;
    const { unlocked, chargeTicks, chargeRequired, playersInside, playersRequired } = world.exitDoor;

    ctx.fillStyle = '#333F5E';
    ctx.fillRect(door.x - 4, door.y - 6, door.w + 8, door.h + 6);
    ctx.strokeStyle = unlocked ? '#4FF0D6' : '#647499';
    ctx.lineWidth = 2;
    ctx.strokeRect(door.x - 3, door.y - 5, door.w + 6, door.h + 4);

    if (unlocked) {
      const pulse = 0.32 + 0.12 * Math.sin(this.animTime * 4);
      ctx.fillStyle = 'rgba(79, 240, 214, 0.16)';
      ctx.fillRect(door.x - 7, door.y - 9, door.w + 14, door.h + 12);
      ctx.fillStyle = `rgba(79, 240, 214, ${pulse.toFixed(2)})`;
      ctx.fillRect(door.x, door.y, door.w, door.h);

      ctx.strokeStyle = '#4FF0D6';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(door.x + 3, door.y + 3, door.w - 6, door.h - 4);

      ctx.fillStyle = '#E6EAF2';
      ctx.font = '900 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${playersInside}/${playersRequired}`, door.x + door.w / 2, door.y - 11);
    } else {
      ctx.fillStyle = '#181F33';
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.fillStyle = '#46547A';
      ctx.fillRect(door.x + door.w / 2 - 1, door.y, 2, door.h);

      const ratio = chargeTicks / Math.max(1, chargeRequired);
      ctx.fillStyle = '#0B0D16';
      ctx.fillRect(door.x + 4, door.y + 20, door.w - 8, 6);
      if (ratio > 0) {
        ctx.fillStyle = '#4FF0D6';
        ctx.fillRect(door.x + 4, door.y + 20, Math.round((door.w - 8) * ratio), 6);
      }

      ctx.fillStyle = '#C4CEE6';
      ctx.font = '800 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED', door.x + door.w / 2, door.y - 11);
    }
  }

  private drawShapeEmblem(
    ctx: CanvasRenderingContext2D,
    shape: ColorblindShape,
    cx: number,
    cy: number,
  ): void {
    ctx.fillStyle = '#0B0D16';
    switch (shape) {
      case 'square':
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      case 'diamond':
        ctx.fillRect(cx - 1, cy - 2, 2, 4);
        ctx.fillRect(cx - 2, cy - 1, 4, 2);
        break;
      case 'triangle':
        ctx.fillRect(cx - 1, cy - 2, 2, 1);
        ctx.fillRect(cx - 2, cy - 1, 4, 2);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'plus':
        ctx.fillRect(cx - 0.5, cy - 2.5, 1.5, 5);
        ctx.fillRect(cx - 2.5, cy - 0.5, 5, 1.5);
        break;
      case 'hex':
        ctx.fillRect(cx - 2, cy - 1, 4, 2);
        ctx.fillRect(cx - 1, cy - 2, 2, 4);
        break;
      case 'star':
        ctx.fillRect(cx - 0.5, cy - 2.5, 1.5, 5);
        ctx.fillRect(cx - 2, cy - 0.5, 4, 1.5);
        break;
      case 'ring':
        ctx.strokeStyle = '#0B0D16';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cx - 2, cy - 2, 4, 4);
        break;
    }
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: SimPlayerState,
    pose: RenderedPlayerPose,
    juice: PlayerJuiceState,
    opts: {
      isControlled: boolean;
      soloPractice: boolean;
      showNames: boolean;
      colorblindShapes: boolean;
      highContrast: boolean;
      reducedMotion: boolean;
      emoteText: string | null;
    },
  ): void {
    const px = Math.round(pose.x);
    const py = Math.round(pose.y);
    const w = PHYSICS.PLAYER_WIDTH;
    const h = PHYSICS.PLAYER_HEIGHT;

    const invulnAlpha =
      player.invulnTicks > 0 && Math.floor(player.invulnTicks / 4) % 2 === 0 ? 0.45 : 1;
    const alpha = (player.connected ? 1 : 0.35) * invulnAlpha;

    // Fast-motion ghost trails behind player
    if (!opts.reducedMotion && player.connected) {
      for (const tp of juice.trail) {
        if (tp.alpha <= 0.03) continue;
        ctx.globalAlpha = tp.alpha * 0.42;
        ctx.fillStyle = player.color;
        ctx.fillRect(Math.round(tp.x) + 1, Math.round(tp.y) + 1, w - 2, h - 4);
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    if (pose.grounded) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.fillRect(px + 2, py + h - 1, w - 4, 2);
    }

    // Foot-anchored squash & stretch transform (keeps pixel feet planted cleanly!)
    const footAnchorX = px + w / 2;
    const footAnchorY = py + h;
    ctx.save();
    ctx.translate(footAnchorX, footAnchorY);
    ctx.scale(juice.scaleX, juice.scaleY);

    const lx = -w / 2;
    const ly = -h;
    const bodyH = h - 4;

    if (opts.isControlled) {
      ctx.fillStyle = `${player.color}30`;
      ctx.fillRect(lx - 3, ly - 2, w + 6, bodyH + 4);
    }

    ctx.fillStyle = '#090B12';
    ctx.fillRect(lx - 1, ly, w + 2, bodyH);
    ctx.fillRect(lx + 1, ly + h - 4, 7, 5);
    ctx.fillRect(lx + w - 8, ly + h - 4, 7, 5);

    ctx.fillStyle = juice.flashTimer > 0 && !opts.reducedMotion ? '#FFFFFF' : player.color;
    ctx.fillRect(lx + 1, ly + 1, w - 2, bodyH - 2);
    ctx.fillRect(lx, ly + 3, w, bodyH - 6);

    if (opts.highContrast) {
      ctx.strokeStyle = '#E6EAF2';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(lx + 0.5, ly + 1.5, w - 1, bodyH - 3);
    }

    ctx.fillStyle = 'rgba(235, 242, 255, 0.62)';
    ctx.fillRect(lx + 2, ly + 1, w - 4, 2);

    const moving = Math.abs(pose.vx) > 16 && pose.grounded;
    const stride = moving ? Math.round(Math.sin(this.animTime * 18) * 2) : 0;
    ctx.fillStyle = player.color;
    ctx.fillRect(lx + 2, ly + h - 4 + Math.min(0, stride), 5, 4);
    ctx.fillRect(lx + w - 7, ly + h - 4 + Math.min(0, -stride), 5, 4);

    const eyeShift = pose.facing > 0 ? 1 : -1;
    ctx.fillStyle = '#0B0D16';
    ctx.fillRect(lx + 3 + eyeShift, ly + 6, w - 6, 5);

    ctx.fillStyle = player.atExit ? '#4FF0D6' : '#F0F4FF';
    ctx.fillRect(lx + 5 + eyeShift, ly + 7, 2, 3);
    ctx.fillRect(lx + 11 + eyeShift, ly + 7, 2, 3);

    if (opts.colorblindShapes) {
      const slotInfo = getPaletteForSlot(player.slot);
      this.drawShapeEmblem(ctx, slotInfo.shape, 0, ly + 14);
    }

    ctx.restore();

    const isAfk = (player.idleTicks ?? 0) >= PHYSICS.AFK_IDLE_TICKS;
    const baseName = player.isSoloPuppet
      ? `${player.badge} · SOLO`
      : `${player.badge} · ${player.displayName.slice(0, 10)}`;
    const label = isAfk ? `${baseName} (AFK)` : baseName;
    ctx.font = '800 9px monospace';
    ctx.textAlign = 'center';
    const centerX = px + w / 2;

    if (opts.isControlled) {
      const bob = Math.round(Math.sin(this.animTime * 7) * 1.5);
      ctx.fillStyle = opts.soloPractice ? '#4FF0D6' : player.color;
      ctx.fillRect(centerX - 3, py - (opts.showNames ? 18 : 10) + bob, 6, 2);
      ctx.fillRect(centerX - 1, py - (opts.showNames ? 16 : 8) + bob, 2, 2);
    }

    if (opts.showNames) {
      ctx.fillStyle = 'rgba(9, 11, 18, 0.84)';
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(centerX - textWidth / 2 - 3, py - 12, textWidth + 6, 10);

      ctx.fillStyle = opts.isControlled ? '#E6EAF2' : '#BAC4DE';
      ctx.fillText(label, centerX, py - 4);
    }

    if (opts.emoteText) {
      const bubbleY = py - (opts.showNames ? 32 : 24);
      ctx.font = '800 9px monospace';
      const bw = ctx.measureText(opts.emoteText).width + 10;
      ctx.fillStyle = '#1B1E29';
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 1.5;
      ctx.fillRect(centerX - bw / 2, bubbleY - 10, bw, 13);
      ctx.strokeRect(centerX - bw / 2 + 0.5, bubbleY - 9.5, bw - 1, 12);
      ctx.fillStyle = '#E6EAF2';
      ctx.fillText(opts.emoteText, centerX, bubbleY);
    }

    ctx.restore();
  }

  private spawnSingleParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    color: string,
    lifeSec: number,
    gravity: number,
    kind: ParticleKind = 'square',
  ): void {
    for (let i = 0; i < this.pool.length; i += 1) {
      const slot = this.pool[i]!;
      if (!slot.active) {
        slot.active = true;
        slot.kind = kind;
        slot.x = x;
        slot.y = y;
        slot.vx = vx;
        slot.vy = vy;
        slot.size = size;
        slot.color = color;
        slot.life = lifeSec;
        slot.maxLife = lifeSec;
        slot.gravity = gravity;
        return;
      }
    }
  }

  private spawnRing(x: number, y: number, color: string, endRadius: number, lifeSec: number): void {
    this.spawnSingleParticle(x, y, 0, 0, endRadius, color, lifeSec, 0, 'ring');
  }

  private burst(
    x: number,
    y: number,
    color: string,
    count: number,
    spreadX: number,
    upVy: number,
    lifeSec: number,
    gravity = 300,
  ): void {
    for (let i = 0; i < count; i += 1) {
      this.spawnSingleParticle(
        x,
        y,
        (Math.random() - 0.5) * 2 * spreadX,
        upVy * (0.4 + Math.random() * 0.9),
        Math.random() > 0.5 ? 3 : 2,
        color,
        lifeSec * (0.7 + Math.random() * 0.5),
        gravity,
        'square',
      );
    }
  }

  private updateParticles(dtSec: number): void {
    for (let i = 0; i < this.pool.length; i += 1) {
      const pt = this.pool[i]!;
      if (!pt.active) continue;
      pt.life -= dtSec;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      if (pt.kind !== 'ring') {
        pt.vy += pt.gravity * dtSec;
        pt.x += pt.vx * dtSec;
        pt.y += pt.vy * dtSec;
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.pool.length; i += 1) {
      const pt = this.pool[i]!;
      if (!pt.active) continue;
      const t = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      ctx.globalAlpha = t;
      if (pt.kind === 'ring') {
        const radius = Math.max(3, Math.round(pt.size * (1 - t)));
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.round(pt.x - radius), Math.round(pt.y - radius), radius * 2, radius * 2);
      } else {
        ctx.fillStyle = pt.color;
        ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
