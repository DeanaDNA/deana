const SETTINGS_KEY = "deana-settings";

export const THEME_MODES = ["system", "light", "dark"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export interface DeanaSettings {
  modelId?: string;
  showReasoning?: boolean;
  byokEnabled?: boolean;
  byokProviderId?: string;
  byokApiKey?: string;
  byokBaseUrl?: string;
  byokModelId?: string;
  byokMaxMessageLength?: number;
  byokMaxFindings?: number;
  themeMode?: ThemeMode;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode);
}

export function normalizeThemeMode(settings: DeanaSettings): ThemeMode {
  if (isThemeMode(settings.themeMode)) {
    return settings.themeMode;
  }

  return "system";
}

export function loadSettings(): DeanaSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as DeanaSettings;
  } catch {
    return {};
  }
}

export function saveSettings(settings: DeanaSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable
  }
}
