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
 * 100% original 60 FPS dark-neon pixel-art Main Menu scene rendered on HTML5 Canvas2D.
 * Static architecture (sky gradient, eclipse moon, gothic citadel towers, mist, obsidian cliff,
 * and contrast scrim) is cached ONCE per viewport resize in an offscreen canvas with ZERO shadowBlur.
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
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

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
    let dpr = 1;
    let staticBg: HTMLCanvasElement | null = null;

    const drawPixelSpire = (
      target: CanvasRenderingContext2D,
      x: number,
      baseY: number,
      w: number,
      h: number,
      litColor: string,
      px: number,
    ) => {
      target.fillStyle = '#141722';
      target.fillRect(x, baseY - h, w, h);
      target.fillRect(x + w * 0.18, baseY - h - px * 5, w * 0.64, px * 5);
      target.fillRect(x + w * 0.38, baseY - h - px * 11, w * 0.24, px * 6);
      target.fillRect(x + w * 0.46, baseY - h - px * 16, w * 0.08, px * 5);

      target.fillStyle = 'rgba(139, 114, 255, 0.2)';
      target.fillRect(x, baseY - h, Math.max(2, px * 0.7), h);

      target.fillStyle = litColor;
      const cols = Math.max(1, Math.floor(w / (px * 6)));
      const rows = Math.max(2, Math.floor(h / (px * 9)));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if ((r + c) % 2 === 0) continue;
          const wx = x + px * 2.5 + c * px * 5;
          const wy = baseY - h + px * 4 + r * px * 7;
          if (wx + px * 1.5 < x + w - px && wy + px * 3 < baseY - px * 4) {
            target.fillRect(
              Math.round(wx),
              Math.round(wy),
              Math.max(2, px * 1.2),
              Math.max(4, px * 2.4),
            );
          }
        }
      }
    };

    const rebuildStaticBg = () => {
      staticBg = staticBg ?? document.createElement('canvas');
      staticBg.width = Math.max(1, Math.floor(viewW * dpr));
      staticBg.height = Math.max(1, Math.floor(viewH * dpr));
      const bctx = staticBg.getContext('2d', { alpha: false });
      if (!bctx) return;

      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.imageSmoothingEnabled = false;
      const px = Math.max(2, Math.min(viewW / 240, viewH / 135));

      // 1. Deep nocturnal sky gradient
      const sky = bctx.createLinearGradient(0, 0, 0, viewH);
      sky.addColorStop(0, '#0D0E14');
      sky.addColorStop(0.55, '#131522');
      sky.addColorStop(1, '#101116');
      bctx.fillStyle = sky;
      bctx.fillRect(0, 0, viewW, viewH);

      // 2. Large glowing Violet-Mint Lunar Eclipse orb
      const moonX = viewW * 0.77;
      const moonY = viewH * 0.32;
      const moonR = Math.min(viewW, viewH) * 0.21;

      const moonHalo = bctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.6);
      moonHalo.addColorStop(0, 'rgba(139, 114, 255, 0.34)');
      moonHalo.addColorStop(0.45, 'rgba(84, 214, 197, 0.12)');
      moonHalo.addColorStop(1, 'rgba(16, 17, 22, 0)');
      bctx.fillStyle = moonHalo;
      bctx.fillRect(0, 0, viewW, viewH);

      bctx.save();
      bctx.beginPath();
      bctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      const moonFill = bctx.createLinearGradient(moonX - moonR, moonY - moonR, moonX + moonR, moonY + moonR);
      moonFill.addColorStop(0, '#9E88FF');
      moonFill.addColorStop(0.55, '#6C54DB');
      moonFill.addColorStop(1, '#3B8F8A');
      bctx.fillStyle = moonFill;
      bctx.fill();

      bctx.beginPath();
      bctx.arc(moonX - moonR * 0.14, moonY - moonR * 0.08, moonR * 0.86, 0, Math.PI * 2);
      bctx.fillStyle = 'rgba(16, 17, 22, 0.42)';
      bctx.fill();
      bctx.restore();

      // 3. Silhouetted dark gothic-tech citadel
      const citadelBaseY = viewH * 0.78;
      drawPixelSpire(bctx, viewW * 0.67, citadelBaseY, px * 22, px * 42, 'rgba(84, 214, 197, 0.45)', px);
      drawPixelSpire(bctx, viewW * 0.75, citadelBaseY, px * 32, px * 64, 'rgba(139, 114, 255, 0.55)', px);
      drawPixelSpire(bctx, viewW * 0.86, citadelBaseY, px * 24, px * 48, 'rgba(84, 214, 197, 0.4)', px);

      // 4. Distant dark mist band
      const mist = bctx.createLinearGradient(0, viewH * 0.56, 0, viewH * 0.92);
      mist.addColorStop(0, 'rgba(16, 17, 22, 0)');
      mist.addColorStop(0.6, 'rgba(16, 17, 22, 0.72)');
      mist.addColorStop(1, 'rgba(16, 17, 22, 0.96)');
      bctx.fillStyle = mist;
      bctx.fillRect(0, viewH * 0.55, viewW, viewH * 0.45);

      // 5. Foreground Center-Right Obsidian Stone Ledge (cached, zero shadowBlur!)
      const ledgeCenterX = viewW > 860 ? viewW * 0.57 : viewW * 0.54;
      const ledgeW = Math.min(viewW * 0.54, px * 116);
      const ledgeY = Math.round(viewH * 0.79);
      const ledgeX = Math.round(ledgeCenterX - ledgeW / 2);

      bctx.fillStyle = '#181B26';
      bctx.fillRect(ledgeX, ledgeY, ledgeW, viewH - ledgeY + 20);
      bctx.fillStyle = '#141722';
      bctx.fillRect(ledgeX - px * 6, ledgeY + px * 8, ledgeW + px * 12, viewH - ledgeY);

      const blockW = Math.round(px * 9);
      const blockH = Math.round(px * 5);
      bctx.strokeStyle = '#101116';
      bctx.lineWidth = 1.5;
      for (let bx = ledgeX; bx < ledgeX + ledgeW - 4; bx += blockW) {
        const bw = Math.min(blockW, ledgeX + ledgeW - bx);
        bctx.fillStyle = '#222738';
        bctx.fillRect(bx, ledgeY, bw - 1, blockH);
        bctx.strokeRect(bx + 0.5, ledgeY + 0.5, bw - 1, blockH);
      }

      // Fast translucent glowing neon fissures (zero shadowBlur!)
      bctx.fillStyle = 'rgba(139, 114, 255, 0.2)';
      bctx.fillRect(ledgeX + px * 5, ledgeY + blockH + px * 0.4, ledgeW - px * 10, Math.max(4, px * 2));
      bctx.fillStyle = 'rgba(139, 114, 255, 0.6)';
      bctx.fillRect(ledgeX + px * 6, ledgeY + blockH + px, ledgeW - px * 12, Math.max(2, px * 0.8));
      bctx.fillStyle = 'rgba(84, 214, 197, 0.52)';
      bctx.fillRect(ledgeX + px * 16, ledgeY + blockH + px * 4, ledgeW - px * 32, Math.max(2, px * 0.6));

      // 6. Left contrast vignette scrim
      const leftScrim = bctx.createLinearGradient(0, 0, viewW * 0.44, 0);
      leftScrim.addColorStop(0, 'rgba(16, 17, 22, 0.88)');
      leftScrim.addColorStop(0.65, 'rgba(16, 17, 22, 0.45)');
      leftScrim.addColorStop(1, 'rgba(16, 17, 22, 0)');
      bctx.fillStyle = leftScrim;
      bctx.fillRect(0, 0, viewW * 0.48, viewH);
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      viewW = Math.max(320, Math.floor(rect.width));
      viewH = Math.max(240, Math.floor(rect.height));
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildStaticBg();
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let rafId = 0;
    let t = 0;
    let lastNow = performance.now();

    const drawFloatingIsland = (cx: number, cy: number, w: number, h: number, px: number, accent: string) => {
      const x = Math.round(cx - w / 2);
      const y = Math.round(cy);
      ctx.fillStyle = '#1B1E29';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#141722';
      ctx.fillRect(x + px * 2, y + h, w - px * 4, px * 3);
      ctx.fillRect(x + px * 5, y + h + px * 3, Math.max(px * 3, w - px * 10), px * 2.5);
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.fillRect(x + px, floorY - px * 0.5, w - px * 2, px * 1.4);

      // Fast aura halo (no radial gradient allocation!)
      ctx.fillStyle = `${color}22`;
      ctx.fillRect(x - px * 2, y - px * 1.5, w + px * 4, h + px * 2);

      ctx.fillStyle = color;
      ctx.fillRect(x + px * 1.2, y + h - px * 2.2, px * 2.6, px * 2.2);
      ctx.fillRect(x + w - px * 3.8, y + h - px * 2.2, px * 2.6, px * 2.2);

      const bodyY = Math.round(y + breath);
      const bodyH = h - px * 2;
      ctx.fillStyle = color;
      ctx.fillRect(x + px * 0.6, bodyY, w - px * 1.2, bodyH);
      ctx.fillRect(x, bodyY + px * 1.2, w, bodyH - px * 2.4);

      ctx.fillStyle = 'rgba(230, 234, 242, 0.45)';
      ctx.fillRect(x + px * 1.4, bodyY + px * 0.5, w - px * 2.8, Math.max(2, px * 0.9));

      const visorY = bodyY + Math.round(bodyH * 0.34);
      const visorH = Math.round(px * 3.1);
      ctx.fillStyle = '#101116';
      ctx.fillRect(x + px * 1.6, visorY, w - px * 3.2, visorH);

      const blinkCycle = (t + idx * 1.73) % 4.6;
      const isBlinking = !reducedMotionRef.current && blinkCycle > 4.46;
      ctx.fillStyle = ready ? THEME_COLORS.secondaryAccent : THEME_COLORS.textPrimary;
      const eyeH = isBlinking ? Math.max(1, px * 0.5) : Math.round(px * 1.7);
      const eyeY = visorY + Math.round((visorH - eyeH) / 2);
      ctx.fillRect(x + px * 2.8, eyeY, Math.round(px * 1.3), eyeH);
      ctx.fillRect(x + w - px * 4.1, eyeY, Math.round(px * 1.3), eyeH);

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

      if (staticBg) {
        ctx.drawImage(staticBg, 0, 0, viewW, viewH);
      } else {
        ctx.fillStyle = '#101116';
        ctx.fillRect(0, 0, viewW, viewH);
      }

      // Twinkling pixel stars
      for (const s of stars) {
        const a = 0.18 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.twinkleOffset));
        ctx.fillStyle = `rgba(230, 234, 242, ${a.toFixed(2)})`;
        ctx.fillRect(Math.round(s.x * viewW), Math.round(s.y * viewH), s.size, s.size);
      }

      // Floating obsidian puzzle platforms
      const bobA = reducedMotionRef.current ? 0 : Math.sin(t * 1.4) * px * 1.8;
      const bobB = reducedMotionRef.current ? 0 : Math.cos(t * 1.1 + 1.2) * px * 2.1;
      drawFloatingIsland(viewW * 0.64, viewH * 0.57 + bobA, px * 24, px * 4.5, px, 'rgba(139,114,255,0.65)');
      drawFloatingIsland(viewW * 0.86, viewH * 0.64 + bobB, px * 28, px * 5, px, 'rgba(84,214,197,0.65)');

      // Hanging foreground chains
      drawChain(viewW * 0.25, viewH * 0.26, t * 0.6, px);
      drawChain(viewW * 0.29, viewH * 0.16, t * 0.5 + 1.2, px);

      const ledgeCenterX = viewW > 860 ? viewW * 0.57 : viewW * 0.54;
      const ledgeW = Math.min(viewW * 0.54, px * 116);
      const ledgeY = Math.round(viewH * 0.79);

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
                connected: live ? live.connected : true,
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

      // Drifting embers
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
