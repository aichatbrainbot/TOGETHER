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

export class GameRenderer {
  private readonly particles: Particle[] = [];
  private animTime = 0;

  spawnEventParticles(events: readonly SimEvent[]): void {
    for (const ev of events) {
      const color = ev.color ?? THEME_COLORS.primaryAccent;
      switch (ev.type) {
        case 'jump':
          this.burst(ev.x, ev.y, color, 6, 48, -28, 0.26);
          break;
        case 'land':
          this.burst(ev.x, ev.y, '#939BB2', 4, 38, -14, 0.2);
          break;
        case 'switch_on':
          this.burst(ev.x, ev.y, color, 8, 65, -55, 0.34);
          break;
        case 'bridge_on':
        case 'bridge_lock':
          this.burst(ev.x, ev.y, THEME_COLORS.secondaryAccent, 14, 95, -55, 0.45);
          break;
        case 'key_pickup':
          this.burst(ev.x, ev.y, THEME_COLORS.gold, 14, 85, -70, 0.48);
          break;
        case 'gate_unlock':
          this.burst(ev.x, ev.y, color, 18, 105, -65, 0.55);
          break;
        case 'door_unlock':
          this.burst(ev.x, ev.y, THEME_COLORS.secondaryAccent, 22, 115, -70, 0.6);
          break;
        case 'respawn':
          this.burst(ev.x, ev.y, THEME_COLORS.danger, 14, 95, -60, 0.45);
          break;
        case 'level_complete':
          this.burst(ev.x, ev.y, THEME_COLORS.primaryAccent, 20, 130, -90, 0.85);
          this.burst(ev.x, ev.y, THEME_COLORS.secondaryAccent, 20, 130, -100, 0.9);
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

    // Seamless full-screen obsidian canvas fill
    ctx.fillStyle = THEME_COLORS.background;
    ctx.fillRect(0, 0, viewW, viewH);

    // Maximize 800x448 playable chamber edge-to-edge inside Discord window
    const scale = Math.min(viewW / level.width, viewH / level.height);
    const offsetX = Math.floor((viewW - level.width * scale) / 2);
    const offsetY = Math.floor((viewH - level.height * scale) / 2);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // 1. Atmospheric chamber backdrop & watermark
    this.drawBackground(ctx, level);

    // 2. Subtle diegetic stencil cues
    this.drawChamberCues(ctx, level, world);

    // 3. Recessed neon circuit wires
    this.drawWires(ctx, level, world);

    // 4. Solid beveled pixel tiles
    this.drawSolids(ctx, level, highContrast);

    // 5. Hazard plasma pits
    this.drawHazards(ctx, level);

    // 6. Retractable & timed neon bridges
    this.drawBridges(ctx, level, world);

    // 7. Moving platforms & guide tracks
    this.drawMovingPlatforms(ctx, level, world, highContrast);

    // 8. Locked security gates
    this.drawLockedGates(ctx, level, world);

    // 9. Cooperative pressure plates & timed/latch switches
    this.drawSwitches(ctx, level, world);

    // 10. Pushable co-op crates (x1 and x2)
    this.drawCrates(ctx, level, world, highContrast);

    // 11. Vault exit gate
    this.drawExitDoor(ctx, level, world);

    // 12. Floating / carried security keys
    this.drawKeys(ctx, level, world);

    // 13. Animated pixel-art players & emote bubbles
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

    // 14. Crisp pixel particles
    if (!reducedMotion) {
      this.drawParticles(ctx);
    }

    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    ctx.fillStyle = THEME_COLORS.background;
    ctx.fillRect(0, 0, level.width, level.height);

    const gradLeft = ctx.createRadialGradient(250, 270, 12, 250, 270, 240);
    gradLeft.addColorStop(0, 'rgba(139, 114, 255, 0.08)');
    gradLeft.addColorStop(1, 'rgba(16, 17, 22, 0)');
    ctx.fillStyle = gradLeft;
    ctx.fillRect(0, 0, level.width, level.height);

    const gradRight = ctx.createRadialGradient(680, 330, 12, 680, 330, 240);
    gradRight.addColorStop(0, 'rgba(84, 214, 197, 0.08)');
    gradRight.addColorStop(1, 'rgba(16, 17, 22, 0)');
    ctx.fillStyle = gradRight;
    ctx.fillRect(0, 0, level.width, level.height);

    ctx.strokeStyle = 'rgba(36, 40, 56, 0.42)';
    ctx.lineWidth = 1;
    for (let x = 32; x < level.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 24);
      ctx.lineTo(x + 0.5, level.height);
      ctx.stroke();
    }
    for (let y = 32; y < level.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(24, y + 0.5);
      ctx.lineTo(level.width - 24, y + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(27, 30, 41, 0.52)';
    ctx.fillRect(148, 24, 16, 360);
    ctx.fillRect(628, 24, 16, 360);

    // Subtle chamber index stencil
    const stamp = level.order <= 9 ? `0${level.order}` : '∞';
    ctx.fillStyle = 'rgba(230, 234, 242, 0.045)';
    ctx.font = '800 56px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(stamp, 42, 92);
  }

  private drawChamberCues(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const swMap = new Map(world.switches.map((s) => [s.id, s]));
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';

    for (const cue of level.cues) {
      if (cue.hideWhenUnlocked && world.exitDoor.unlocked) continue;
      if (cue.hideWhenSwitchLatched && swMap.get(cue.hideWhenSwitchLatched)?.latched) continue;
      ctx.fillStyle =
        cue.accent === 'mint' ? 'rgba(84, 214, 197, 0.45)' : 'rgba(139, 114, 255, 0.45)';
      ctx.fillText(cue.text, cue.x, cue.y);
    }
  }

  private drawWires(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const swMap = new Map(world.switches.map((s) => [s.id, s]));

    for (const wire of level.wires) {
      const sw = swMap.get(wire.linkedTo);
      const isLit =
        wire.linkedTo === 'exit'
          ? world.exitDoor.unlocked
          : Boolean(sw?.pressed || sw?.latched || (sw && sw.remainingTicks > 0));

      const accent =
        wire.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      ctx.save();
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';

      ctx.strokeStyle = '#1D2130';
      ctx.lineWidth = 4;
      ctx.beginPath();
      wire.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      ctx.strokeStyle = isLit ? accent : '#2C3247';
      ctx.lineWidth = 2;
      if (isLit) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawSolids(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    highContrast: boolean,
  ): void {
    for (const rect of level.solids) {
      ctx.fillStyle = THEME_COLORS.panel;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.strokeStyle = '#141722';
      ctx.lineWidth = 1;
      for (let tx = rect.x; tx < rect.x + rect.w; tx += 16) {
        for (let ty = rect.y; ty < rect.y + rect.h; ty += 16) {
          const bw = Math.min(16, rect.x + rect.w - tx);
          const bh = Math.min(16, rect.y + rect.h - ty);
          ctx.strokeRect(tx + 0.5, ty + 0.5, bw - 1, bh - 1);
        }
      }

      ctx.fillStyle = highContrast ? '#3E4663' : THEME_COLORS.surface;
      ctx.fillRect(rect.x, rect.y, rect.w, 3);
      ctx.fillStyle = highContrast ? 'rgba(230, 234, 242, 0.55)' : 'rgba(139, 114, 255, 0.24)';
      ctx.fillRect(rect.x, rect.y, rect.w, 1);
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    for (const h of level.hazards) {
      ctx.fillStyle = '#1F111A';
      ctx.fillRect(h.x, h.y, h.w, h.h);

      const pulse = 0.65 + 0.25 * Math.sin(this.animTime * 5);
      ctx.fillStyle = `rgba(255, 107, 139, ${pulse.toFixed(2)})`;
      ctx.fillRect(h.x, h.y + 4, h.w, 4);

      ctx.fillStyle = '#FF6B8B';
      for (let sx = h.x + 2; sx < h.x + h.w - 6; sx += 12) {
        const waveY = Math.round(Math.sin(this.animTime * 4 + sx * 0.12) * 1.5);
        ctx.fillRect(sx, h.y + 2 + waveY, 6, 3);
        ctx.fillRect(sx + 2, h.y + waveY, 2, 2);
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
      const color = locked ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      ctx.fillStyle = THEME_COLORS.surface;
      ctx.fillRect(def.x - 4, def.y - 2, 6, def.h + 4);
      ctx.fillRect(def.x + def.w - 2, def.y - 2, 6, def.h + 4);
      ctx.fillStyle = active ? color : '#3C425B';
      ctx.fillRect(def.x - 2, def.y + 3, 2, def.h - 6);
      ctx.fillRect(def.x + def.w, def.y + 3, 2, def.h - 6);

      if (!active) {
        ctx.save();
        ctx.strokeStyle = 'rgba(139, 114, 255, 0.28)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(def.x + 1, def.y + 1, def.w - 2, def.h - 2);
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = locked ? 'rgba(84, 214, 197, 0.24)' : 'rgba(139, 114, 255, 0.24)';
      ctx.fillRect(def.x, def.y, def.w, def.h);

      ctx.fillStyle = color;
      ctx.fillRect(def.x, def.y, def.w, 3);
      ctx.fillRect(def.x, def.y + def.h - 2, def.w, 2);

      // Timed bridge draining indicator bar
      if (state && state.maxTicks > 0 && !locked) {
        const ratio = Math.max(0, Math.min(1, state.remainingTicks / state.maxTicks));
        ctx.fillStyle = ratio < 0.25 ? THEME_COLORS.warning : THEME_COLORS.secondaryAccent;
        ctx.fillRect(def.x + 2, def.y + 5, Math.round((def.w - 4) * ratio), 4);
      } else {
        const shimmerOffset = Math.floor(this.animTime * 48) % 16;
        ctx.fillStyle = 'rgba(230, 234, 242, 0.25)';
        for (let bx = def.x + shimmerOffset; bx < def.x + def.w - 4; bx += 16) {
          ctx.fillRect(bx, def.y + 5, 6, 5);
        }
      }
      ctx.restore();
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
        def.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      // Guide track rail between start and end centers
      ctx.save();
      ctx.strokeStyle = mp.active ? 'rgba(139, 114, 255, 0.26)' : 'rgba(147, 155, 178, 0.14)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(def.startX + def.w / 2, def.startY + def.h / 2);
      ctx.lineTo(def.endX + def.w / 2, def.endY + def.h / 2);
      ctx.stroke();
      ctx.restore();

      const x = Math.round(mp.x);
      const y = Math.round(mp.y);

      // Platform chassis
      ctx.fillStyle = '#24293B';
      ctx.fillRect(x, y, mp.w, mp.h);
      ctx.strokeStyle = highContrast ? THEME_COLORS.textPrimary : mp.active ? accent : '#4A5270';
      ctx.lineWidth = highContrast ? 1.5 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, mp.w - 1, mp.h - 1);

      // Glowing top grip strip
      ctx.fillStyle = mp.active ? accent : '#4A5270';
      ctx.fillRect(x + 2, y + 1, mp.w - 4, 3);

      // Subtle thruster pips underneath when active
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
        def.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      if (gate?.unlocked) {
        // Retracted emitter caps
        ctx.fillStyle = '#2A3044';
        ctx.fillRect(def.x, def.y, def.w, 6);
        ctx.fillRect(def.x, def.y + def.h - 6, def.w, 6);
        ctx.fillStyle = accent;
        ctx.fillRect(def.x + 4, def.y + 4, def.w - 8, 2);
        continue;
      }

      // Locked vertical neon barrier
      ctx.save();
      ctx.fillStyle = '#1B1E29';
      ctx.fillRect(def.x, def.y, def.w, def.h);
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      ctx.fillStyle = accent;
      ctx.fillRect(def.x + 5, def.y + 4, def.w - 10, def.h - 8);
      ctx.restore();

      // Center keyhole emblem
      const cy = def.y + def.h / 2;
      ctx.fillStyle = '#101116';
      ctx.fillRect(def.x + 2, cy - 8, def.w - 4, 16);
      ctx.fillStyle = THEME_COLORS.gold;
      ctx.fillRect(def.x + 6, cy - 5, 4, 4);
      ctx.fillRect(def.x + 7, cy - 1, 2, 5);
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
      const accent =
        def.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;
      const effectiveReq = world.soloPractice ? 1 : c.requiredPushers;
      const isBeingPushedEnough = c.activePushers >= effectiveReq;

      ctx.save();
      if (isBeingPushedEnough) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 10;
      }

      // Dark metallic crate body
      ctx.fillStyle = '#252A3C';
      ctx.fillRect(x, y, c.w, c.h);

      // Diagonal industrial brace
      ctx.strokeStyle = '#191D2B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + c.w - 4, y + c.h - 4);
      ctx.moveTo(x + c.w - 4, y + 4);
      ctx.lineTo(x + 4, y + c.h - 4);
      ctx.stroke();

      // Rim highlight & corner rivets
      ctx.strokeStyle = highContrast
        ? THEME_COLORS.textPrimary
        : isBeingPushedEnough
          ? accent
          : 'rgba(230, 234, 242, 0.24)';
      ctx.lineWidth = highContrast ? 2 : 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, c.w - 1, c.h - 1);

      ctx.fillStyle = accent;
      ctx.fillRect(x + 2, y + 2, 3, 3);
      ctx.fillRect(x + c.w - 5, y + 2, 3, 3);
      ctx.fillRect(x + 2, y + c.h - 5, 3, 3);
      ctx.fillRect(x + c.w - 5, y + c.h - 5, 3, 3);

      // Clear weight badge stamp ("x1" or "x2")
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(16, 17, 22, 0.8)';
      ctx.fillRect(x + 5, y + c.h / 2 - 6, c.w - 10, 12);
      ctx.fillStyle = isBeingPushedEnough ? accent : THEME_COLORS.textPrimary;
      ctx.font = '800 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`x${effectiveReq}`, x + c.w / 2, y + c.h / 2 + 3);

      // Show "1/2" hint above heavy crate when one teammate is pushing alone
      if (effectiveReq === 2 && c.activePushers === 1) {
        ctx.fillStyle = THEME_COLORS.warning;
        ctx.font = '700 8px monospace';
        ctx.fillText('1/2 PUSH', x + c.w / 2, y - 4);
      }
      ctx.restore();
    }
  }

  private drawKeys(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const playerById = new Map(world.players.map((p) => [p.id, p]));
    for (let i = 0; i < level.keys.length; i += 1) {
      const def = level.keys[i]!;
      const key = world.keys[i]!;
      if (key.used) continue;

      const bob = Math.round(Math.sin(this.animTime * 4 + i) * 2.5);
      const kx = Math.round(key.x);
      const ky = Math.round(key.y + bob);

      // Tether line to carrier
      if (key.carrierPlayerId) {
        const carrier = playerById.get(key.carrierPlayerId);
        if (carrier) {
          ctx.strokeStyle = 'rgba(255, 224, 102, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(carrier.x + PHYSICS.PLAYER_WIDTH / 2, carrier.y + 8);
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.shadowColor = THEME_COLORS.gold;
      ctx.shadowBlur = 10;
      ctx.fillStyle = THEME_COLORS.gold;
      // Pixel key bow (ring)
      ctx.fillRect(kx - 6, ky - 4, 7, 7);
      ctx.fillStyle = THEME_COLORS.background;
      ctx.fillRect(kx - 4, ky - 2, 3, 3);
      // Key shaft & teeth
      ctx.fillStyle = THEME_COLORS.gold;
      ctx.fillRect(kx + 1, ky - 1, 8, 2);
      ctx.fillRect(kx + 5, ky + 1, 2, 3);
      ctx.fillRect(kx + 8, ky + 1, 2, 2);
      ctx.restore();
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
        def.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      ctx.fillStyle = '#2A3044';
      ctx.fillRect(def.x - 2, def.y + def.h - 3, def.w + 4, 3);

      const plateY = depressed ? def.y + 3 : def.y;
      const plateH = depressed ? def.h - 3 : def.h - 1;

      ctx.save();
      if (active) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = active ? accent : '#4A5270';
      ctx.fillRect(def.x, plateY, def.w, plateH);
      ctx.fillStyle = active ? '#E6EAF2' : '#717B9E';
      ctx.fillRect(def.x + 2, plateY, def.w - 4, 1);
      ctx.restore();

      ctx.fillStyle = active ? accent : 'rgba(147, 155, 178, 0.65)';
      ctx.font = '700 8px monospace';
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

    ctx.fillStyle = THEME_COLORS.surface;
    ctx.fillRect(door.x - 4, door.y - 6, door.w + 8, door.h + 6);
    ctx.strokeStyle = unlocked ? THEME_COLORS.secondaryAccent : '#3D445E';
    ctx.lineWidth = 2;
    ctx.strokeRect(door.x - 3, door.y - 5, door.w + 6, door.h + 4);

    if (unlocked) {
      ctx.save();
      const pulse = 0.25 + 0.12 * Math.sin(this.animTime * 4);
      ctx.fillStyle = `rgba(84, 214, 197, ${pulse.toFixed(2)})`;
      ctx.fillRect(door.x, door.y, door.w, door.h);

      ctx.shadowColor = THEME_COLORS.secondaryAccent;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = THEME_COLORS.secondaryAccent;
      ctx.lineWidth = 2;
      ctx.strokeRect(door.x + 3, door.y + 3, door.w - 6, door.h - 4);
      ctx.restore();

      ctx.fillStyle = THEME_COLORS.textPrimary;
      ctx.font = '800 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${playersInside}/${playersRequired}`, door.x + door.w / 2, door.y - 11);
    } else {
      ctx.fillStyle = '#151822';
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.fillStyle = '#2C3247';
      ctx.fillRect(door.x + door.w / 2 - 1, door.y, 2, door.h);

      const ratio = chargeTicks / Math.max(1, chargeRequired);
      ctx.fillStyle = '#101116';
      ctx.fillRect(door.x + 4, door.y + 20, door.w - 8, 6);
      if (ratio > 0) {
        ctx.fillStyle = THEME_COLORS.secondaryAccent;
        ctx.fillRect(door.x + 4, door.y + 20, Math.round((door.w - 8) * ratio), 6);
      }

      ctx.fillStyle = THEME_COLORS.textMuted;
      ctx.font = '700 8px monospace';
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
    ctx.fillStyle = '#101116';
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
        ctx.strokeStyle = '#101116';
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
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(px + 2, py + h - 1, w - 4, 2);
    }

    const stretchY = !pose.grounded && Math.abs(pose.vy) > 90 ? 1 : 0;
    const bodyY = py - stretchY;
    const bodyH = h - 4 + stretchY;

    if (opts.isControlled) {
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 10;
    }

    // Main pixel-art torso
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 1, bodyY + 1, w - 2, bodyH - 2);
    ctx.fillRect(px, bodyY + 3, w, bodyH - 6);

    ctx.shadowBlur = 0;

    if (opts.highContrast) {
      ctx.strokeStyle = THEME_COLORS.textPrimary;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, bodyY + 1.5, w - 1, bodyH - 3);
    }

    // Flat stackable crown cap
    ctx.fillStyle = 'rgba(230, 234, 242, 0.44)';
    ctx.fillRect(px + 2, bodyY + 1, w - 4, 2);

    // Animated legs
    const moving = Math.abs(pose.vx) > 16 && pose.grounded;
    const stride = moving ? Math.round(Math.sin(this.animTime * 18) * 2) : 0;
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 2, py + h - 4 + Math.min(0, stride), 5, 4);
    ctx.fillRect(px + w - 7, py + h - 4 + Math.min(0, -stride), 5, 4);

    // Dark pixel visor & directional glowing eyes
    const eyeShift = pose.facing > 0 ? 1 : -1;
    ctx.fillStyle = '#101116';
    ctx.fillRect(px + 3 + eyeShift, bodyY + 6, w - 6, 5);

    ctx.fillStyle = player.atExit ? THEME_COLORS.secondaryAccent : THEME_COLORS.textPrimary;
    ctx.fillRect(px + 5 + eyeShift, bodyY + 7, 2, 3);
    ctx.fillRect(px + 11 + eyeShift, bodyY + 7, 2, 3);

    // Accessibility: distinct geometric shape emblem on chest when Colorblind Shapes enabled
    if (opts.colorblindShapes) {
      const slotInfo = getPaletteForSlot(player.slot);
      this.drawShapeEmblem(ctx, slotInfo.shape, px + Math.round(w / 2), bodyY + 14);
    }

    const label = player.isSoloPuppet
      ? `${player.badge} · SOLO`
      : `${player.badge} · ${player.displayName.slice(0, 10)}`;
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';
    const centerX = px + w / 2;

    if (opts.isControlled) {
      const bob = Math.round(Math.sin(this.animTime * 7) * 1.5);
      ctx.fillStyle = opts.soloPractice ? THEME_COLORS.secondaryAccent : player.color;
      ctx.fillRect(centerX - 3, py - (opts.showNames ? 18 : 10) + bob, 6, 2);
      ctx.fillRect(centerX - 1, py - (opts.showNames ? 16 : 8) + bob, 2, 2);
    }

    if (opts.showNames) {
      ctx.fillStyle = 'rgba(16, 17, 22, 0.74)';
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(centerX - textWidth / 2 - 3, py - 12, textWidth + 6, 10);

      ctx.fillStyle = opts.isControlled ? THEME_COLORS.textPrimary : THEME_COLORS.textMuted;
      ctx.fillText(label, centerX, py - 4);
    }

    // Live co-op Emote Speech Bubble
    if (opts.emoteText) {
      const bubbleY = py - (opts.showNames ? 32 : 24);
      ctx.font = '800 9px monospace';
      const bw = ctx.measureText(opts.emoteText).width + 10;
      ctx.fillStyle = THEME_COLORS.panel;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 1.5;
      ctx.fillRect(centerX - bw / 2, bubbleY - 10, bw, 13);
      ctx.strokeRect(centerX - bw / 2 + 0.5, bubbleY - 9.5, bw - 1, 12);
      ctx.fillStyle = THEME_COLORS.textPrimary;
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
      if (this.particles.length >= 180) break;
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
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      ctx.restore();
    }
  }
}
