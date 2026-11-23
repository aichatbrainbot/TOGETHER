export const ACTIVITY_LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  DISCONNECT_GRACE_MS: 30_000,
  MAX_INSTANCE_ID_LENGTH: 128,
  HEARTBEAT_INTERVAL_MS: 10_000,
} as const;

export const THEME_COLORS = {
  background: '#101116',
  panel: '#1B1E29',
  surface: '#242838',
  primaryAccent: '#8B72FF',
  secondaryAccent: '#54D6C5',
  textPrimary: '#E6EAF2',
  textMuted: '#939BB2',
  danger: '#FF6B8B',
  warning: '#FFB84D',
} as const;

export interface PlayerPaletteSlot {
  readonly slot: number;
  readonly badge: string;
  readonly name: string;
  readonly color: string;
  readonly accent: string;
}

export const PLAYER_PALETTE: readonly PlayerPaletteSlot[] = [
  { slot: 0, badge: 'P1', name: 'Violet', color: '#8B72FF', accent: '#B7A7FF' },
  { slot: 1, badge: 'P2', name: 'Mint', color: '#54D6C5', accent: '#97EDE1' },
  { slot: 2, badge: 'P3', name: 'Coral', color: '#FF6B8B', accent: '#FFA3B7' },
  { slot: 3, badge: 'P4', name: 'Amber', color: '#FFB84D', accent: '#FFD594' },
  { slot: 4, badge: 'P5', name: 'Sky', color: '#52B6FF', accent: '#9ED6FF' },
  { slot: 5, badge: 'P6', name: 'Lime', color: '#8CE964', accent: '#C0F5A8' },
  { slot: 6, badge: 'P7', name: 'Orchid', color: '#E07BFF', accent: '#F0B8FF' },
  { slot: 7, badge: 'P8', name: 'Gold', color: '#FFE066', accent: '#FFF0AD' },
] as const;

export function getPaletteForSlot(slot: number): PlayerPaletteSlot {
  const index = Math.abs(slot) % PLAYER_PALETTE.length;
  return PLAYER_PALETTE[index]!;
}
