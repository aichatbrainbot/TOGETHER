import { useEffect, useRef } from 'react';

interface PixelAvatarCanvasProps {
  color: string;
  connected: boolean;
  ready: boolean;
  size?: number;
}

/**
 * Renders an original dark-theme pixel-art character sprite on HTML5 Canvas2D.
 * Used as a preview emblem in Phase 1 and as the visual basis for Phase 2 gameplay sprites.
 */
export function PixelAvatarCanvas({
  color,
  connected,
  ready,
  size = 40,
}: PixelAvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 16, 16);

    ctx.globalAlpha = connected ? 1 : 0.4;

    // Subtle ground shadow
    ctx.fillStyle = '#101116';
    ctx.fillRect(3, 14, 10, 2);

    // Character silhouette (original compact pixel-art sprite)
    ctx.fillStyle = color;
    ctx.fillRect(4, 3, 8, 9); // main body
    ctx.fillRect(3, 5, 10, 6); // rounded shoulders
    ctx.fillRect(4, 12, 3, 2); // left foot
    ctx.fillRect(9, 12, 3, 2); // right foot

    // Flat top highlight (signals stackable head surface for Phase 2 co-op)
    ctx.fillStyle = '#E6EAF2';
    ctx.globalAlpha = connected ? 0.35 : 0.15;
    ctx.fillRect(5, 3, 6, 1);

    // Visor / dark face band
    ctx.globalAlpha = connected ? 1 : 0.4;
    ctx.fillStyle = '#101116';
    ctx.fillRect(5, 6, 6, 3);

    // Glowing eyes
    ctx.fillStyle = ready ? '#54D6C5' : '#E6EAF2';
    ctx.fillRect(6, 7, 1, 2);
    ctx.fillRect(9, 7, 1, 2);

    ctx.globalAlpha = 1;
  }, [color, connected, ready]);

  return (
    <canvas
      ref={canvasRef}
      width={16}
      height={16}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
      }}
      aria-hidden="true"
    />
  );
}
