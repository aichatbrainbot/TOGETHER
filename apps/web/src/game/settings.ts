export interface GameSettings {
  soundEnabled: boolean;
  volume: number; // 0 to 1
  showPlayerNames: boolean;
  colorblindShapes: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = 'together_settings_v2';

export const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  volume: 0.7,
  showPlayerNames: true,
  colorblindShapes: false,
  highContrast: false,
  reducedMotion: false,
};

export function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('together_settings_v1');
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
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
