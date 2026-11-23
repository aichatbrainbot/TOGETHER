export interface GameSettings {
  soundEnabled: boolean;
  volume: number; // 0 to 1
  showPlayerNames: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = 'together_settings_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  volume: 0.7,
  showPlayerNames: true,
  reducedMotion: false,
};

export function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SETTINGS.volume,
      showPlayerNames:
        typeof parsed.showPlayerNames === 'boolean'
          ? parsed.showPlayerNames
          : DEFAULT_SETTINGS.showPlayerNames,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage restrictions in sandboxed environments
  }
}
