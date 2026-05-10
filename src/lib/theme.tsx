import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadSettings, saveSettings } from "./settings";

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ isDark: false, toggle: () => { } });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      const settings = loadSettings();

      if (settings.darkMode !== undefined) {
        return settings.darkMode;
      }

      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  function toggle() {
    setIsDark((current) => {
      const next = !current;

      try { saveSettings({ ...loadSettings(), darkMode: next }); } catch { }

      return next;
    });
  }

  return <ThemeContext.Provider value={{ isDark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
