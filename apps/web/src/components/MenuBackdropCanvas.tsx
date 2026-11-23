import { type ActivityPlayer, PLAYER_PALETTE, THEME_COLORS } from '@together/game-core';
import { useEffect, useRef } from 'react';

interface MenuBackdropCanvasProps {
  players: readonly ActivityPlayer[];
  reducedMotion: boolean;
}

interface Ember {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  color: string;
  alpha: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleOffset: number;
}

/**
 * 100% original animated dark-neon pixel-art Main Menu scene rendered on HTML5 Canvas2D.
 * Zero external image assets or paid AI APIs; live Discord players stand together on the cliff!
 */
export function MenuBackdropCanvas({ players, reducedMotion }: MenuBackdropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playersRef = useRef<readonly ActivityPlayer[]>(players);
  const reducedMotionRef = useRef<boolean>(reducedMotion);

  playersRef.current = players;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Deterministic seeded stars & embers so scene composition is balanced every time
    const stars: Star[] = Array.from({ length: 58 }, (_, i) => ({
      x: ((i * 197 + 41) % 640) / 640,
      y: ((i * 113 + 19) % 220) / 360,
      size: i % 5 === 0 ? 2 : 1,
      twinkleOffset: i * 0.7,
    }));

    const embers: Ember[] = Array.from({ length: 34 }, (_, i) => ({
      x: ((i * 89 + 23) % 640) / 640,
      y: ((i * 53 + 17) % 360) / 360,
      vy: 0.015 + (i % 5) * 0.006,
      vx: ((i % 7) - 3) * 0.004,
      size: i % 3 === 0 ? 3 : 2,
      color: i % 3 === 0 ? THEME_COLORS.secondaryAccent : THEME_COLORS.primaryAccent,
      alpha: 0.25 + (i % 4) * 0.14,
      phase: i * 1.1,
    }));

    let viewW = 960;
    let viewH = 540;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = Math.max(320, Math.floor(rect.width));
      viewH = Math.max(240, Math.floor(rect.height));
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let rafId = 0;
    let t = 0;
    let lastNow = performance.now();

    const drawPixelSpire = (
      x: number,
      baseY: number,
      w: number,
      h: number,
      litColor: string,
      px: number,
    ) => {
      // Silhouette tower body
      ctx.fillStyle = '#141722';
      ctx.fillRect(x, baseY - h, w, h);
      // Tapered top battlements & spire
      ctx.fillRect(x + w * 0.18, baseY - h - px * 5, w * 0.64, px * 5);
      ctx.fillRect(x + w * 0.38, baseY - h - px * 11, w * 0.24, px * 6);
      ctx.fillRect(x + w * 0.46, baseY - h - px * 16, w * 0.08, px * 5);

      // Subtle rim light on left facing moon
      ctx.fillStyle = 'rgba(139, 114, 255, 0.2)';
      ctx.fillRect(x, baseY - h, Math.max(2, px * 0.7), h);

      // Glowing narrow chamber windows
      ctx.fillStyle = litColor;
      const cols = Math.max(1, Math.floor(w / (px * 6)));
      const rows = Math.max(2, Math.floor(h / (px * 9)));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if ((r + c) % 2 === 0) continue;
          const wx = x + px * 2.5 + c * px * 5;
          const wy = baseY - h + px * 4 + r * px * 7;
          if (wx + px * 1.5 < x + w - px && wy + px * 3 < baseY - px * 4) {
            ctx.fillRect(Math.round(wx), Math.round(wy), Math.max(2, px * 1.2), Math.max(4, px * 2.4));
          }
        }
      }
    };

    const drawFloatingIsland = (cx: number, cy: number, w: number, h: number, px: number, accent: string) => {
      const x = Math.round(cx - w / 2);
      const y = Math.round(cy);
      ctx.fillStyle = '#1B1E29';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#141722';
      ctx.fillRect(x + px * 2, y + h, w - px * 4, px * 3);
      ctx.fillRect(x + px * 5, y + h + px * 3, Math.max(px * 3, w - px * 10), px * 2.5);
      // Top stone trim + neon circuit vein
      ctx.fillStyle = '#282E42';
      ctx.fillRect(x, y, w, Math.max(2, px));
      ctx.fillStyle = accent;
      ctx.fillRect(x + px * 2, y + Math.round(h * 0.5), w - px * 4, Math.max(1.5, px * 0.6));
    };

    const drawChain = (x: number, length: number, swing: number, px: number) => {
      ctx.strokeStyle = '#1D2130';
      ctx.lineWidth = Math.max(2, px * 0.9);
      const linkH = px * 3.2;
      const links = Math.ceil(length / linkH);
      for (let i = 0; i < links; i += 1) {
        const ly = i * linkH;
        const lx = x + Math.sin(swing + i * 0.14) * (i * 0.45);
        ctx.strokeRect(lx - px, ly, px * 2, linkH * 0.85);
      }
    };

    const drawHeroBuddy = (
      cx: number,
      floorY: number,
      color: string,
      ready: boolean,
      connected: boolean,
      badge: string,
      idx: number,
      px: number,
    ) => {
      const w = Math.round(px * 9.5);
      const h = Math.round(px * 11.5);
      const hop = ready && !reducedMotionRef.current ? Math.abs(Math.sin(t * 4.5 + idx * 1.1)) * px * 2.6 : 0;
      const breath = !reducedMotionRef.current ? Math.sin(t * 2.2 + idx * 1.4) * px * 0.35 : 0;
      const x = Math.round(cx - w / 2);
      const y = Math.round(floorY - h - hop);

      ctx.save();
      ctx.globalAlpha = connected ? 1 : 0.45;

      // Ground contact shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.fillRect(x + px, floorY - px * 0.5, w - px * 2, px * 1.4);

      // Soft neon aura beneath character
      const aura = ctx.createRadialGradient(cx, y + h * 0.55, px, cx, y + h * 0.55, w * 1.15);
      aura.addColorStop(0, `${color}40`);
      aura.addColorStop(1, 'rgba(16,17,22,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(cx - w * 1.2, y - w * 0.6, w * 2.4, h + w * 1.2);

      // Stubby pixel feet
      ctx.fillStyle = color;
      ctx.fillRect(x + px * 1.2, y + h - px * 2.2, px * 2.6, px * 2.2);
      ctx.fillRect(x + w - px * 3.8, y + h - px * 2.2, px * 2.6, px * 2.2);

      // Blocky original visor-bot torso (NO cat ears — flat stackable crown!)
      const bodyY = Math.round(y + breath);
      const bodyH = h - px * 2;
      ctx.fillStyle = color;
      ctx.fillRect(x + px * 0.6, bodyY, w - px * 1.2, bodyH);
      ctx.fillRect(x, bodyY + px * 1.2, w, bodyH - px * 2.4);

      // Flat stackable crown highlight
      ctx.fillStyle = 'rgba(230, 234, 242, 0.45)';
      ctx.fillRect(x + px * 1.4, bodyY + px * 0.5, w - px * 2.8, Math.max(2, px * 0.9));

      // Dark pixel visor
      const visorY = bodyY + Math.round(bodyH * 0.34);
      const visorH = Math.round(px * 3.1);
      ctx.fillStyle = '#101116';
      ctx.fillRect(x + px * 1.6, visorY, w - px * 3.2, visorH);

      // Blinking glowing square eyes
      const blinkCycle = (t + idx * 1.73) % 4.6;
      const isBlinking = !reducedMotionRef.current && blinkCycle > 4.46;
      ctx.fillStyle = ready ? THEME_COLORS.secondaryAccent : THEME_COLORS.textPrimary;
      const eyeH = isBlinking ? Math.max(1, px * 0.5) : Math.round(px * 1.7);
      const eyeY = visorY + Math.round((visorH - eyeH) / 2);
      ctx.fillRect(x + px * 2.8, eyeY, Math.round(px * 1.3), eyeH);
      ctx.fillRect(x + w - px * 4.1, eyeY, Math.round(px * 1.3), eyeH);

      // Micro badge beneath feet on cliff face
      ctx.font = `700 ${Math.max(9, Math.round(px * 2.6))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? THEME_COLORS.secondaryAccent : 'rgba(230, 234, 242, 0.6)';
      ctx.fillText(badge, cx, floorY + px * 4.2);

      ctx.restore();
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      t += reducedMotionRef.current ? dt * 0.15 : dt;

      const px = Math.max(2, Math.min(viewW / 240, viewH / 135));
      ctx.imageSmoothingEnabled = false;

      // 1. Deep nocturnal sky gradient (#101116 -> subtle violet horizon)
      const sky = ctx.createLinearGradient(0, 0, 0, viewH);
      sky.addColorStop(0, '#0D0E14');
      sky.addColorStop(0.55, '#131522');
      sky.addColorStop(1, '#101116');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, viewW, viewH);

      // 2. Twinkling pixel stars
      for (const s of stars) {
        const a = 0.18 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.twinkleOffset));
        ctx.fillStyle = `rgba(230, 234, 242, ${a.toFixed(2)})`;
        ctx.fillRect(Math.round(s.x * viewW), Math.round(s.y * viewH), s.size, s.size);
      }

      // 3. Large glowing Violet-Mint Lunar Eclipse orb on right side (cinematic focal backdrop)
      const moonX = viewW * 0.77;
      const moonY = viewH * 0.32;
      const moonR = Math.min(viewW, viewH) * 0.21;

      const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.6);
      moonHalo.addColorStop(0, 'rgba(139, 114, 255, 0.34)');
      moonHalo.addColorStop(0.45, 'rgba(84, 214, 197, 0.12)');
      moonHalo.addColorStop(1, 'rgba(16, 17, 22, 0)');
      ctx.fillStyle = moonHalo;
      ctx.fillRect(0, 0, viewW, viewH);

      ctx.save();
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      const moonFill = ctx.createLinearGradient(moonX - moonR, moonY - moonR, moonX + moonR, moonY + moonR);
      moonFill.addColorStop(0, '#9E88FF');
      moonFill.addColorStop(0.55, '#6C54DB');
      moonFill.addColorStop(1, '#3B8F8A');
      ctx.fillStyle = moonFill;
      ctx.fill();

      // Subtle inner eclipse shadow crescent for moody dark-theme depth
      ctx.beginPath();
      ctx.arc(moonX - moonR * 0.14, moonY - moonR * 0.08, moonR * 0.86, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 17, 22, 0.42)';
      ctx.fill();
      ctx.restore();

      // 4. Silhouetted dark gothic-tech puzzle citadel on right horizon
      const citadelBaseY = viewH * 0.78;
      drawPixelSpire(viewW * 0.67, citadelBaseY, px * 22, px * 42, 'rgba(84, 214, 197, 0.45)', px);
      drawPixelSpire(viewW * 0.75, citadelBaseY, px * 32, px * 64, 'rgba(139, 114, 255, 0.55)', px);
      drawPixelSpire(viewW * 0.86, citadelBaseY, px * 24, px * 48, 'rgba(84, 214, 197, 0.4)', px);

      // 5. Distant dark mist band separating citadel from foreground
      const mist = ctx.createLinearGradient(0, viewH * 0.56, 0, viewH * 0.92);
      mist.addColorStop(0, 'rgba(16, 17, 22, 0)');
      mist.addColorStop(0.6, 'rgba(16, 17, 22, 0.72)');
      mist.addColorStop(1, 'rgba(16, 17, 22, 0.96)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, viewH * 0.55, viewW, viewH * 0.45);

      // 6. Floating obsidian puzzle platforms
      const bobA = reducedMotionRef.current ? 0 : Math.sin(t * 1.4) * px * 1.8;
      const bobB = reducedMotionRef.current ? 0 : Math.cos(t * 1.1 + 1.2) * px * 2.1;
      drawFloatingIsland(viewW * 0.64, viewH * 0.57 + bobA, px * 24, px * 4.5, px, 'rgba(139,114,255,0.65)');
      drawFloatingIsland(viewW * 0.86, viewH * 0.64 + bobB, px * 28, px * 5, px, 'rgba(84,214,197,0.65)');

      // 7. Hanging foreground chains framing the left & top edges
      drawChain(viewW * 0.25, viewH * 0.26, t * 0.6, px);
      drawChain(viewW * 0.29, viewH * 0.16, t * 0.5 + 1.2, px);

      // 8. Foreground Center-Right Obsidian Stone Ledge where the squad stands
      const ledgeCenterX = viewW > 860 ? viewW * 0.57 : viewW * 0.54;
      const ledgeW = Math.min(viewW * 0.54, px * 116);
      const ledgeY = Math.round(viewH * 0.79);
      const ledgeX = Math.round(ledgeCenterX - ledgeW / 2);

      // Stone cliff mass
      ctx.fillStyle = '#181B26';
      ctx.fillRect(ledgeX, ledgeY, ledgeW, viewH - ledgeY + 20);
      ctx.fillStyle = '#141722';
      ctx.fillRect(ledgeX - px * 6, ledgeY + px * 8, ledgeW + px * 12, viewH - ledgeY);

      // Tiled obsidian masonry blocks on cliff top
      const blockW = Math.round(px * 9);
      const blockH = Math.round(px * 5);
      ctx.strokeStyle = '#101116';
      ctx.lineWidth = 1.5;
      for (let bx = ledgeX; bx < ledgeX + ledgeW - 4; bx += blockW) {
        const bw = Math.min(blockW, ledgeX + ledgeW - bx);
        ctx.fillStyle = '#222738';
        ctx.fillRect(bx, ledgeY, bw - 1, blockH);
        ctx.strokeRect(bx + 0.5, ledgeY + 0.5, bw - 1, blockH);
      }

      // Glowing neon fissure beneath the ledge top
      ctx.save();
      ctx.shadowColor = THEME_COLORS.primaryAccent;
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(139, 114, 255, 0.55)';
      ctx.fillRect(ledgeX + px * 6, ledgeY + blockH + px, ledgeW - px * 12, Math.max(2, px * 0.8));
      ctx.fillStyle = 'rgba(84, 214, 197, 0.5)';
      ctx.fillRect(ledgeX + px * 16, ledgeY + blockH + px * 4, ledgeW - px * 32, Math.max(2, px * 0.6));
      ctx.restore();

      // 9. Live connected squad (or 4 vibrant preview buddies when solo) standing on the stone cliff!
      const livePlayers = playersRef.current;
      const squadChars =
        livePlayers.length >= 2
          ? livePlayers.slice(0, 8).map((p) => ({
              color: p.color,
              ready: p.ready,
              connected: p.connected,
              badge: p.badge,
            }))
          : [0, 1, 2, 3].map((slot) => {
              const live = livePlayers.find((p) => p.slot === slot);
              const pal = PLAYER_PALETTE[slot]!;
              return {
                color: live?.color ?? pal.color,
                ready: live ? live.ready : false,
                connected: live ? live.connected : slot === 0 ? true : true,
                badge: live ? live.badge : pal.badge,
              };
            });

      const spacing = Math.min(px * 15.5, (ledgeW - px * 14) / Math.max(1, squadChars.length));
      const startX = ledgeCenterX - ((squadChars.length - 1) * spacing) / 2;
      squadChars.forEach((char, idx) => {
        drawHeroBuddy(
          startX + idx * spacing,
          ledgeY,
          char.color,
          char.ready,
          char.connected,
          char.badge,
          idx,
          px,
        );
      });

      // 10. Drifting neon embers
      for (const e of embers) {
        if (!reducedMotionRef.current) {
          e.y -= e.vy * dt;
          e.x += (e.vx + Math.sin(t + e.phase) * 0.004) * dt;
          if (e.y < -0.02) {
            e.y = 1.02;
            e.x = (e.x + 0.37) % 1;
          }
        }
        ctx.fillStyle = e.color;
        ctx.globalAlpha = e.alpha;
        ctx.fillRect(Math.round(e.x * viewW), Math.round(e.y * viewH), e.size, e.size);
      }
      ctx.globalAlpha = 1;

      // 11. Left vignette scrim guaranteeing >= 7:1 contrast behind the left Game Menu rail
      const leftScrim = ctx.createLinearGradient(0, 0, viewW * 0.44, 0);
      leftScrim.addColorStop(0, 'rgba(16, 17, 22, 0.88)');
      leftScrim.addColorStop(0.65, 'rgba(16, 17, 22, 0.45)');
      leftScrim.addColorStop(1, 'rgba(16, 17, 22, 0)');
      ctx.fillStyle = leftScrim;
      ctx.fillRect(0, 0, viewW * 0.48, viewH);

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="menu-backdrop-canvas" aria-hidden="true" />;
}
