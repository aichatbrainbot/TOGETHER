import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M6.5 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function ChambersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function CrownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M3 18h18l-1.6-9.5-4.4 3.5L12 5.5 9 12 4.6 8.5 3 18Zm1 2h16v1.5H4V20Z" />
    </svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.8 5.8a9 9 0 0 1 0 12.4" />
    </svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </svg>
  );
}

export function FullscreenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

export function DiceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function SignalIcon({ pingMs }: { pingMs: number | null }) {
  const bars = pingMs === null ? 1 : pingMs < 90 ? 3 : pingMs < 180 ? 2 : 1;
  return (
    <svg viewBox="0 0 16 14" width={15} height={13} aria-hidden="true">
      <rect x="1" y="9" width="3" height="4" rx="0.8" fill={bars >= 1 ? '#54D6C5' : '#32384D'} />
      <rect x="6.5" y="5.5" width="3" height="7.5" rx="0.8" fill={bars >= 2 ? '#54D6C5' : '#32384D'} />
      <rect x="12" y="2" width="3" height="11" rx="0.8" fill={bars >= 3 ? '#54D6C5' : '#32384D'} />
    </svg>
  );
}

export function TogetherCrest(props: IconProps) {
  return (
    <svg viewBox="0 0 96 96" width={88} height={88} fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="crestRing" x1="12" y1="12" x2="84" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B72FF" />
          <stop offset="100%" stopColor="#54D6C5" />
        </linearGradient>
      </defs>
      {/* Outer beveled obsidian shield */}
      <polygon
        points="48,5 85,26 85,70 48,91 11,70 11,26"
        fill="#151822"
        stroke="url(#crestRing)"
        strokeWidth="2.5"
      />
      <polygon
        points="48,13 77,30 77,66 48,83 19,66 19,30"
        fill="#1B1E29"
        stroke="rgba(230,234,242,0.12)"
        strokeWidth="1.2"
      />
      {/* Two interlocked pixel-bot silhouettes symbolizing co-op stacking */}
      <rect x="29" y="45" width="16" height="18" rx="2" fill="#8B72FF" />
      <rect x="32" y="50" width="10" height="4" fill="#101116" />
      <rect x="34" y="51" width="2" height="2" fill="#E6EAF2" />
      <rect x="38" y="51" width="2" height="2" fill="#E6EAF2" />

      <rect x="51" y="45" width="16" height="18" rx="2" fill="#54D6C5" />
      <rect x="54" y="50" width="10" height="4" fill="#101116" />
      <rect x="56" y="51" width="2" height="2" fill="#E6EAF2" />
      <rect x="60" y="51" width="2" height="2" fill="#E6EAF2" />

      {/* Stacked top buddy linking both together */}
      <rect x="40" y="25" width="16" height="16" rx="2" fill="#E6EAF2" fillOpacity="0.92" />
      <rect x="43" y="30" width="10" height="4" fill="#101116" />
      <rect x="45" y="31" width="2" height="2" fill="#8B72FF" />
      <rect x="49" y="31" width="2" height="2" fill="#54D6C5" />

      {/* Neon bridge bar underneath */}
      <rect x="26" y="67" width="44" height="3.5" rx="1.75" fill="url(#crestRing)" />
    </svg>
  );
}
