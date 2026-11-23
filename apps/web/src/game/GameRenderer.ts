import {
  type GameWorldState,
  LEVEL_CHAMBER_01,
  type LevelDefinition,
  PHYSICS,
  type SimEvent,
  type SimPlayerState,
  THEME_COLORS,
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
        case 'door_unlock':
          this.burst(ev.x, ev.y, THEME_COLORS.secondaryAccent, 22, 115, -70, 0.6);
          break;
        case 'respawn':
          this.burst(ev.x, ev.y, THEME_COLORS.danger, 14, 95, -60, 0.45);
          break;
        case 'level_complete':
          this.burst(ev.x, ev.y, THEME_COLORS.primaryAccent, 18, 130, -90, 0.8);
          this.burst(ev.x, ev.y, THEME_COLORS.secondaryAccent, 18, 130, -100, 0.85);
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
    level: LevelDefinition = LEVEL_CHAMBER_01,
  ): void {
    this.animTime += dtSec;
    this.updateParticles(dtSec);

    ctx.imageSmoothingEnabled = false;

    // 1. Dark atmospheric chamber backdrop
    this.drawBackground(ctx, level);

    // 2. Subtle diegetic chamber stencil cues (helps players discover stacking & dual plates)
    this.drawChamberCues(ctx, world);

    // 3. Recessed neon circuit wires connecting switches -> bridge & vault -> exit
    this.drawWires(ctx, level, world);

    // 4. Beveled pixel-art solid platforms & outer walls
    this.drawSolids(ctx, level);

    // 5. Neon plasma hazard pit
    this.drawHazards(ctx, level);

    // 6. Retractable neon energy bridges
    this.drawBridges(ctx, level, world);

    // 7. Cooperative pressure plates & latching switches
    this.drawSwitches(ctx, level, world);

    // 8. Vault exit gate & unlock progress
    this.drawExitDoor(ctx, level, world);

    // 9. Pixel-art players (draw non-controlled first, active controlled player crisp on top)
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
      this.drawPlayer(ctx, player, pose, player.id === controlledId, world.soloPractice);
    }

    // 10. Crisp pixel particles
    this.drawParticles(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    ctx.fillStyle = THEME_COLORS.background;
    ctx.fillRect(0, 0, level.width, level.height);

    // Soft ambient neon depth vignettes (low-contrast, eye-friendly)
    const gradLeft = ctx.createRadialGradient(256, 280, 12, 256, 280, 240);
    gradLeft.addColorStop(0, 'rgba(139, 114, 255, 0.08)');
    gradLeft.addColorStop(1, 'rgba(16, 17, 22, 0)');
    ctx.fillStyle = gradLeft;
    ctx.fillRect(0, 0, level.width, level.height);

    const gradRight = ctx.createRadialGradient(690, 340, 12, 690, 340, 230);
    gradRight.addColorStop(0, 'rgba(84, 214, 197, 0.08)');
    gradRight.addColorStop(1, 'rgba(16, 17, 22, 0)');
    ctx.fillStyle = gradRight;
    ctx.fillRect(0, 0, level.width, level.height);

    // Subtle recessed architectural tile grid (32x32)
    ctx.strokeStyle = 'rgba(36, 40, 56, 0.45)';
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

    // Recessed chamber structural columns
    ctx.fillStyle = 'rgba(27, 30, 41, 0.55)';
    ctx.fillRect(148, 24, 16, 360);
    ctx.fillRect(628, 24, 16, 360);

    // Subtle watermark stencil
    ctx.fillStyle = 'rgba(230, 234, 242, 0.045)';
    ctx.font = '800 58px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('01', 44, 96);
  }

  private drawChamberCues(ctx: CanvasRenderingContext2D, world: GameWorldState): void {
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';

    const bridge = world.bridges[0];
    if (!bridge?.locked) {
      ctx.fillStyle = 'rgba(139, 114, 255, 0.42)';
      ctx.fillText('STACK HERE ↑', 182, 344);
    }

    if (!world.exitDoor.unlocked) {
      ctx.fillStyle = 'rgba(84, 214, 197, 0.38)';
      ctx.fillText('HOLD A + B TOGETHER', 639, 348);
    } else {
      ctx.fillStyle = 'rgba(84, 214, 197, 0.65)';
      ctx.fillText('EXIT UNLOCKED →', 639, 348);
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
          : Boolean(sw?.pressed || sw?.latched);

      const accent =
        wire.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      ctx.save();
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';

      // Dark housing channel
      ctx.strokeStyle = '#1D2130';
      ctx.lineWidth = 4;
      ctx.beginPath();
      wire.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // Inner trace
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

  private drawSolids(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    for (const rect of level.solids) {
      // Base slate body
      ctx.fillStyle = THEME_COLORS.panel;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      // Tiled 16x16 dark bevel brick seams
      ctx.strokeStyle = '#141722';
      ctx.lineWidth = 1;
      for (let tx = rect.x; tx < rect.x + rect.w; tx += 16) {
        for (let ty = rect.y; ty < rect.y + rect.h; ty += 16) {
          const bw = Math.min(16, rect.x + rect.w - tx);
          const bh = Math.min(16, rect.y + rect.h - ty);
          ctx.strokeRect(tx + 0.5, ty + 0.5, bw - 1, bh - 1);
        }
      }

      // Crisp top floor highlight strip
      ctx.fillStyle = THEME_COLORS.surface;
      ctx.fillRect(rect.x, rect.y, rect.w, 3);
      ctx.fillStyle = 'rgba(139, 114, 255, 0.22)';
      ctx.fillRect(rect.x, rect.y, rect.w, 1);
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, level: LevelDefinition): void {
    for (const h of level.hazards) {
      ctx.fillStyle = '#1F111A';
      ctx.fillRect(h.x, h.y, h.w, h.h);

      const pulse = 0.65 + 0.25 * Math.sin(this.animTime * 5);

      // Subtle glowing plasma top strip
      ctx.fillStyle = `rgba(255, 107, 139, ${pulse.toFixed(2)})`;
      ctx.fillRect(h.x, h.y + 4, h.w, 4);

      // Pixel hazard teeth
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

      // Cliff emitters (left & right anchor nodes)
      ctx.fillStyle = THEME_COLORS.surface;
      ctx.fillRect(def.x - 4, def.y - 2, 6, def.h + 4);
      ctx.fillRect(def.x + def.w - 2, def.y - 2, 6, def.h + 4);
      ctx.fillStyle = active ? color : '#3C425B';
      ctx.fillRect(def.x - 2, def.y + 3, 2, def.h - 6);
      ctx.fillRect(def.x + def.w, def.y + 3, 2, def.h - 6);

      if (!active) {
        // Inactive hologram blueprint guide
        ctx.save();
        ctx.strokeStyle = 'rgba(139, 114, 255, 0.28)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(def.x + 1, def.y + 1, def.w - 2, def.h - 2);
        ctx.restore();
        continue;
      }

      // Active solid neon energy bridge
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = locked ? 'rgba(84, 214, 197, 0.24)' : 'rgba(139, 114, 255, 0.24)';
      ctx.fillRect(def.x, def.y, def.w, def.h);

      // Solid energy deck cap + pixel ribs
      ctx.fillStyle = color;
      ctx.fillRect(def.x, def.y, def.w, 3);
      ctx.fillRect(def.x, def.y + def.h - 2, def.w, 2);

      const shimmerOffset = Math.floor(this.animTime * 48) % 16;
      ctx.fillStyle = 'rgba(230, 234, 242, 0.25)';
      for (let bx = def.x + shimmerOffset; bx < def.x + def.w - 4; bx += 16) {
        ctx.fillRect(bx, def.y + 5, 6, 5);
      }
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
      const active = Boolean(state?.pressed || state?.latched);
      const depressed = Boolean(state?.pressed || state?.latched);
      const accent =
        def.accent === 'mint' ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent;

      // Base socket
      ctx.fillStyle = '#2A3044';
      ctx.fillRect(def.x - 2, def.y + def.h - 3, def.w + 4, 3);

      // Plate top (sinks 3 px when activated)
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

      // Tiny crisp label beneath switch on solid tile
      ctx.fillStyle = active ? accent : 'rgba(147, 155, 178, 0.65)';
      ctx.font = '700 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state?.latched ? 'LOCKED' : def.label, def.x + def.w / 2, def.y + 18);
    }
  }

  private drawExitDoor(
    ctx: CanvasRenderingContext2D,
    level: LevelDefinition,
    world: GameWorldState,
  ): void {
    const door = level.exitDoor;
    const { unlocked, chargeTicks, chargeRequired, playersInside, playersRequired } = world.exitDoor;

    // Outer frame
    ctx.fillStyle = THEME_COLORS.surface;
    ctx.fillRect(door.x - 4, door.y - 6, door.w + 8, door.h + 6);
    ctx.strokeStyle = unlocked ? THEME_COLORS.secondaryAccent : '#3D445E';
    ctx.lineWidth = 2;
    ctx.strokeRect(door.x - 3, door.y - 5, door.w + 6, door.h + 4);

    if (unlocked) {
      // Glowing open portal interior
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

      // Inner players counter
      ctx.fillStyle = THEME_COLORS.textPrimary;
      ctx.font = '800 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${playersInside}/${playersRequired}`,
        door.x + door.w / 2,
        door.y - 11,
      );
    } else {
      // Locked dark bulkhead doors
      ctx.fillStyle = '#151822';
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.fillStyle = '#2C3247';
      ctx.fillRect(door.x + door.w / 2 - 1, door.y, 2, door.h);

      // Charge progress bar when both vault plates are held
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

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: SimPlayerState,
    pose: RenderedPlayerPose,
    isControlled: boolean,
    soloPractice: boolean,
  ): void {
    const px = Math.round(pose.x);
    const py = Math.round(pose.y);
    const w = PHYSICS.PLAYER_WIDTH;
    const h = PHYSICS.PLAYER_HEIGHT;

    // Respawn invulnerability blink
    const invulnAlpha =
      player.invulnTicks > 0 && Math.floor(player.invulnTicks / 4) % 2 === 0 ? 0.45 : 1;
    const alpha = (player.connected ? 1 : 0.35) * invulnAlpha;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Subtle ground contact shadow
    if (pose.grounded) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(px + 2, py + h - 1, w - 4, 2);
    }

    // Subtle squash/stretch visual offset
    const stretchY = !pose.grounded && Math.abs(pose.vy) > 90 ? 1 : 0;
    const bodyY = py - stretchY;
    const bodyH = h - 4 + stretchY;

    // Subtle neon glow around active controlled character
    if (isControlled) {
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 10;
    }

    // Main pixel-art torso
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 1, bodyY + 1, w - 2, bodyH - 2);
    ctx.fillRect(px, bodyY + 3, w, bodyH - 6);

    // Clear flat top head cap (signals stackable surface visually)
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(230, 234, 242, 0.42)';
    ctx.fillRect(px + 2, bodyY + 1, w - 4, 2);

    // Animated legs
    const moving = Math.abs(pose.vx) > 16 && pose.grounded;
    const stride = moving ? Math.round(Math.sin(this.animTime * 18) * 2) : 0;
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 2, py + h - 4 + Math.min(0, stride), 5, 4);
    ctx.fillRect(px + w - 7, py + h - 4 + Math.min(0, -stride), 5, 4);

    // Dark pixel visor
    const eyeShift = pose.facing > 0 ? 1 : -1;
    ctx.fillStyle = '#101116';
    ctx.fillRect(px + 3 + eyeShift, bodyY + 6, w - 6, 5);

    // Expressive glowing eyes
    ctx.fillStyle = player.atExit ? THEME_COLORS.secondaryAccent : THEME_COLORS.textPrimary;
    ctx.fillRect(px + 5 + eyeShift, bodyY + 7, 2, 3);
    ctx.fillRect(px + 11 + eyeShift, bodyY + 7, 2, 3);

    // Floating crisp name & badge label
    const label = player.isSoloPuppet ? `${player.badge} · SOLO` : `${player.badge} · ${player.displayName.slice(0, 10)}`;
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';
    const centerX = px + w / 2;

    if (isControlled) {
      // Active control chevron indicator
      const bob = Math.round(Math.sin(this.animTime * 7) * 1.5);
      ctx.fillStyle = soloPractice ? THEME_COLORS.secondaryAccent : player.color;
      ctx.fillRect(centerX - 3, py - 18 + bob, 6, 2);
      ctx.fillRect(centerX - 1, py - 16 + bob, 2, 2);
    }

    ctx.fillStyle = 'rgba(16, 17, 22, 0.72)';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(centerX - textWidth / 2 - 3, py - 12, textWidth + 6, 10);

    ctx.fillStyle = isControlled ? THEME_COLORS.textPrimary : THEME_COLORS.textMuted;
    ctx.fillText(label, centerX, py - 4);

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
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      ctx.restore();
    }
  }
}
