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
  gold: '#FFE066',
  silver: '#C7D1E6',
  bronze: '#E09A6B',
} as const;

export type ColorblindShape =
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'circle'
  | 'plus'
  | 'hex'
  | 'star'
  | 'ring';

export interface PlayerPaletteSlot {
  readonly slot: number;
  readonly badge: string;
  readonly name: string;
  readonly color: string;
  readonly accent: string;
  readonly shape: ColorblindShape;
}

export const PLAYER_PALETTE: readonly PlayerPaletteSlot[] = [
  { slot: 0, badge: 'P1', name: 'Violet', color: '#8B72FF', accent: '#B7A7FF', shape: 'square' },
  { slot: 1, badge: 'P2', name: 'Mint', color: '#54D6C5', accent: '#97EDE1', shape: 'diamond' },
  { slot: 2, badge: 'P3', name: 'Coral', color: '#FF6B8B', accent: '#FFA3B7', shape: 'triangle' },
  { slot: 3, badge: 'P4', name: 'Amber', color: '#FFB84D', accent: '#FFD594', shape: 'circle' },
  { slot: 4, badge: 'P5', name: 'Sky', color: '#52B6FF', accent: '#9ED6FF', shape: 'plus' },
  { slot: 5, badge: 'P6', name: 'Lime', color: '#8CE964', accent: '#C0F5A8', shape: 'hex' },
  { slot: 6, badge: 'P7', name: 'Orchid', color: '#E07BFF', accent: '#F0B8FF', shape: 'star' },
  { slot: 7, badge: 'P8', name: 'Gold', color: '#FFE066', accent: '#FFF0AD', shape: 'ring' },
] as const;

export const EMOTE_PINGS = [
  { id: 'stack', label: 'STACK!', key: '1' },
  { id: 'wait', label: 'WAIT!', key: '2' },
  { id: 'go', label: 'GO!', key: '3' },
  { id: 'nice', label: 'NICE!', key: '4' },
] as const;

export type EmotePingId = (typeof EMOTE_PINGS)[number]['id'];

export const CHALLENGE_MODIFIERS = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced cooperative platformer physics (Ranked).',
    ranked: true,
  },
  {
    id: 'speed_run',
    name: 'Speed Run',
    description: 'Tight par-time medal challenge with live countdown (Ranked).',
    ranked: true,
  },
  {
    id: 'low_gravity',
    name: 'Low Gravity',
    description: 'Moon-chamber physics (0.76x gravity) for floaty chaos (Unranked).',
    ranked: false,
  },
] as const;

export type ChallengeModifier = (typeof CHALLENGE_MODIFIERS)[number]['id'];

export function getPaletteForSlot(slot: number): PlayerPaletteSlot {
  const index = Math.abs(slot) % PLAYER_PALETTE.length;
  return PLAYER_PALETTE[index]!;
}
