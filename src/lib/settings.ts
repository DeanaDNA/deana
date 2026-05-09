const SETTINGS_KEY = "deana-settings";

export interface DeanaSettings {
  modelId?: string;
  showReasoning?: boolean;
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
