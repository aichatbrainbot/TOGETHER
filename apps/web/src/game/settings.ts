export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  volume: number; // 0 to 1
  showPlayerNames: boolean;
  colorblindShapes: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  fillViewport: boolean;
  cinemaMode: boolean;
}

const STORAGE_KEY = 'together_settings_v4';

export const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  musicEnabled: true,
  volume: 0.7,
  showPlayerNames: true,
  colorblindShapes: false,
  highContrast: false,
  reducedMotion: false,
  fillViewport: true,
  cinemaMode: false,
};

export function loadGameSettings(): GameSettings {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('together_settings_v3') ??
      localStorage.getItem('together_settings_v2') ??
      localStorage.getItem('together_settings_v1');
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      musicEnabled:
        typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : DEFAULT_SETTINGS.musicEnabled,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SETTINGS.volume,
      showPlayerNames:
        typeof parsed.showPlayerNames === 'boolean'
          ? parsed.showPlayerNames
          : DEFAULT_SETTINGS.showPlayerNames,
      colorblindShapes:
        typeof parsed.colorblindShapes === 'boolean'
          ? parsed.colorblindShapes
          : DEFAULT_SETTINGS.colorblindShapes,
      highContrast:
        typeof parsed.highContrast === 'boolean'
          ? parsed.highContrast
          : DEFAULT_SETTINGS.highContrast,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion,
      fillViewport:
        typeof parsed.fillViewport === 'boolean'
          ? parsed.fillViewport
          : DEFAULT_SETTINGS.fillViewport,
      cinemaMode:
        typeof parsed.cinemaMode === 'boolean' ? parsed.cinemaMode : DEFAULT_SETTINGS.cinemaMode,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage restrictions
  }
}
