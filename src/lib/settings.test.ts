import { afterEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "./settings";

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
});
