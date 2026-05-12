import { afterEach, describe, expect, it } from "vitest";
import { loadSettings, normalizeThemeMode, saveSettings } from "./settings";

describe("settings", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("persists BYOK provider preferences locally", () => {
    saveSettings({
      byokEnabled: true,
      byokProviderId: "ollama",
      byokBaseUrl: "http://localhost:11434/v1",
      byokModelId: "llama3.1",
    });

    expect(loadSettings()).toMatchObject({
      byokEnabled: true,
      byokProviderId: "ollama",
      byokBaseUrl: "http://localhost:11434/v1",
      byokModelId: "llama3.1",
    });
  });

  it("normalizes theme mode settings", () => {
    expect(normalizeThemeMode({})).toBe("system");
    expect(normalizeThemeMode({ themeMode: "system" })).toBe("system");
    expect(normalizeThemeMode({ themeMode: "light" })).toBe("light");
    expect(normalizeThemeMode({ themeMode: "dark" })).toBe("dark");
    expect(normalizeThemeMode({ themeMode: "invalid" as never })).toBe("system");
  });
});
