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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
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

/**
 * Ultra-fast 60 FPS high-contrast dark-theme Canvas2D pixel-art renderer.
 * Performance architecture for smooth Discord Activity WebView playback:
 *  - ZERO ctx.shadowBlur (replaces expensive Gaussian blurs with crisp translucent pixel halos)
 *  - Offscreen static layer cache: pre-renders backdrop, grid, watermark, beveled walls & one-way
 *    ledges ONCE per (levelId, highContrast) and blits in a single drawImage() per frame!
 *  - 3-tier luminance figure-ground hierarchy (Celeste / Hollow Knight style).
 */
export class GameRenderer {
  private readonly particles: Particle[] = [];
  private animTime = 0;

  private staticCache: HTMLCanvasElement | null = null;
  private staticCacheKey = '';

  spawnEventParticles(events: readonly SimEvent[]): void {
    for (const ev of events) {
      const color = ev.color ?? THEME_COLORS.primaryAccent;
      switch (ev.type) {
        case 'jump':
          this.burst(ev.x, ev.y, color, 6, 48, -28, 0.26);
          break;
        case 'land':
          this.burst(ev.x, ev.y, '#9AA6C7', 4, 38, -14, 0.2);
          break;
        case 'bounce':
          this.burst(ev.x, ev.y, color, 14, 90, -110, 0.42);
          break;
        case 'crumble':
          this.burst(ev.x, ev.y, '#FFB84D', 12, 85, -35, 0.45);
          break;
        case 'checkpoint':
          this.burst(ev.x, ev.y, '#4FF0D6', 18, 95, -95, 0.55);
          break;
        case 'switch_on':
          this.burst(ev.x, ev.y, color, 8, 65, -55, 0.34);
          break;
        case 'bridge_on':
        case 'bridge_lock':
          this.burst(ev.x, ev.y, '#4FF0D6', 14, 95, -55, 0.45);
          break;
        case 'key_pickup':
          this.burst(ev.x, ev.y, '#FFD166', 16, 85, -70, 0.48);
          break;
        case 'gate_unlock':
          this.burst(ev.x, ev.y, color, 18, 105, -65, 0.55);
          break;
        case 'door_unlock':
          this.burst(ev.x, ev.y, '#4FF0D6', 22, 115, -70, 0.6);
          break;
        case 'respawn':
          this.burst(ev.x, ev.y, '#FF4D6D', 16, 100, -65, 0.48);
          break;
        case 'level_complete':
          this.burst(ev.x, ev.y, '#A28BFF', 22, 135, -95, 0.85);
          this.burst(ev.x, ev.y, '#4FF0D6', 22, 135, -105, 0.9);
          break;
      }
    }
  }

  resetEffects(): void {
    this.particles.length = 0;
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
    const offsetX = Math.floor((viewW - drawW) / 2);
    const offsetY = Math.floor((viewH - drawH) / 2);

    // Only fill letterbox bars if present (avoid wasted full-screen overdraw)
    if (offsetX > 0 || offsetY > 0 || drawW < viewW || drawH < viewH) {
      ctx.fillStyle = '#090B12';
      ctx.fillRect(0, 0, viewW, viewH);
    }

    ctx.translate(offsetX, offsetY);
    ctx.scale(scaleX, scaleY);

    // 1. Single-blit cached static layer (backdrop + grid + watermark + all beveled walls + one-way ledges)
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

    // 3. Glowing circuit wires (fast layered stroke, zero shadowBlur)
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

    // 12. Cooperative switches
    this.drawSwitches(ctx, level, world);

    // 13. High-contrast Amber x1 & Violet x2 cooperative push crates
    this.drawCrates(ctx, level, world, highContrast);

    // 14. Exit door portal
    this.drawExitDoor(ctx, level, world);

    // 15. Radiant gold keys
    this.drawKeys(ctx, level, world, posesByPlayerId);

    // 16. Crisp dark-outlined vivid pixel players + emotes
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
      const activeEmote = emotes?.get(player.id);
      const emoteText =
        activeEmote && activeEmote.expiresAt > nowMs
          ? (EMOTE_LABEL_MAP.get(activeEmote.emote) ?? null)
          : null;

      this.drawPlayer(ctx, player, pose, {
        isControlled: player.id === controlledId,
        soloPractice: world.soloPractice,
        showNames,
        colorblindShapes,
        highContrast,
        emoteText,
      });
    }

    // 17. Pixel particles
    if (!reducedMotion && this.particles.length > 0) {
      this.drawParticles(ctx);
    }

    ctx.restore();
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

    // Soft ambient pools tinted with stage accent
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

    // Subtle low-contrast blueprint grid (batched single stroke)
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

    // Subtle background watermark with stage code (1..4, S1..S4, ∞)
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

      // Conduit backing
      ctx.strokeStyle = '#181E30';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Fast translucent halo when lit (zero shadowBlur!)
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

      // Fast halo + launch cap (zero shadowBlur)
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

      // Fast outer laser aura + crimson beam + pulsing core (zero shadowBlur)
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

      // Fast plasma surface aura (zero shadowBlur)
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

      // Fast outer neon halo (zero shadowBlur)
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

      // Fast gold halo (zero shadowBlur)
      ctx.fillStyle = 'rgba(255, 209, 102, 0.24)';
      ctx.fillRect(kx - 9, ky - 7, 22, 13);

      // Dark outline for instant readability
      ctx.fillStyle = '#0B0D16';
      ctx.fillRect(kx - 7, ky - 5, 9, 9);
      ctx.fillRect(kx + 1, ky - 2, 10, 4);
      // Radiant Gold key
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
      // Outer portal glow halo (zero shadowBlur)
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
    opts: {
      isControlled: boolean;
      soloPractice: boolean;
      showNames: boolean;
      colorblindShapes: boolean;
      highContrast: boolean;
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

    ctx.save();
    ctx.globalAlpha = alpha;

    if (pose.grounded) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.fillRect(px + 2, py + h - 1, w - 4, 2);
    }

    const stretchY = !pose.grounded && Math.abs(pose.vy) > 90 ? 1 : 0;
    const bodyY = py - stretchY;
    const bodyH = h - 4 + stretchY;

    // Fast controlled-player aura (zero shadowBlur!)
    if (opts.isControlled) {
      ctx.fillStyle = `${player.color}30`;
      ctx.fillRect(px - 3, bodyY - 2, w + 6, bodyH + 4);
    }

    // Crisp 1px dark outer silhouette outline
    ctx.fillStyle = '#090B12';
    ctx.fillRect(px - 1, bodyY, w + 2, bodyH);
    ctx.fillRect(px + 1, py + h - 4, 7, 5);
    ctx.fillRect(px + w - 8, py + h - 4, 7, 5);

    // Vivid player torso
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 1, bodyY + 1, w - 2, bodyH - 2);
    ctx.fillRect(px, bodyY + 3, w, bodyH - 6);

    if (opts.highContrast) {
      ctx.strokeStyle = '#E6EAF2';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px + 0.5, bodyY + 1.5, w - 1, bodyH - 3);
    }

    // Luminous flat stackable crown cap
    ctx.fillStyle = 'rgba(235, 242, 255, 0.62)';
    ctx.fillRect(px + 2, bodyY + 1, w - 4, 2);

    // Animated legs
    const moving = Math.abs(pose.vx) > 16 && pose.grounded;
    const stride = moving ? Math.round(Math.sin(this.animTime * 18) * 2) : 0;
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 2, py + h - 4 + Math.min(0, stride), 5, 4);
    ctx.fillRect(px + w - 7, py + h - 4 + Math.min(0, -stride), 5, 4);

    // Dark pixel visor & bright eyes
    const eyeShift = pose.facing > 0 ? 1 : -1;
    ctx.fillStyle = '#0B0D16';
    ctx.fillRect(px + 3 + eyeShift, bodyY + 6, w - 6, 5);

    ctx.fillStyle = player.atExit ? '#4FF0D6' : '#F0F4FF';
    ctx.fillRect(px + 5 + eyeShift, bodyY + 7, 2, 3);
    ctx.fillRect(px + 11 + eyeShift, bodyY + 7, 2, 3);

    if (opts.colorblindShapes) {
      const slotInfo = getPaletteForSlot(player.slot);
      this.drawShapeEmblem(ctx, slotInfo.shape, px + Math.round(w / 2), bodyY + 14);
    }

    const label = player.isSoloPuppet
      ? `${player.badge} · SOLO`
      : `${player.badge} · ${player.displayName.slice(0, 10)}`;
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

  private burst(
    x: number,
    y: number,
    color: string,
    count: number,
    spreadX: number,
    upVy: number,
    lifeSec: number,
  ): void {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= 160) break;
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2 * spreadX,
        vy: upVy * (0.4 + Math.random() * 0.9),
        size: Math.random() > 0.5 ? 3 : 2,
        color,
        life: lifeSec * (0.7 + Math.random() * 0.5),
        maxLife: lifeSec,
      });
    }
  }

  private updateParticles(dtSec: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const pt = this.particles[i]!;
      pt.life -= dtSec;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy += 320 * dtSec;
      pt.x += pt.vx * dtSec;
      pt.y += pt.vy * dtSec;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }
}
