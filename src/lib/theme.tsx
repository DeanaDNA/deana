import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadSettings, normalizeThemeMode, saveSettings, type ThemeMode } from "./settings";

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLORS = {
  light: "#103f35",
  dark: "#1b1916",
} as const;

function systemPrefersDark() {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  isDark: false,
  setMode: () => { },
  toggle: () => { },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => normalizeThemeMode(loadSettings()));
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);
  const isDark = mode === "system" ? systemIsDark : mode === "dark";

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media || mode !== "system") return;

    setSystemIsDark(media.matches);

    function onChange(event: MediaQueryListEvent) {
      setSystemIsDark(event.matches);
    }

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  useEffect(() => {
    const resolvedTheme = isDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[resolvedTheme]);
  }, [isDark]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    if (nextMode === mode) return;

    setModeState(nextMode);
    saveSettings({ ...loadSettings(), themeMode: nextMode });
  }, [mode]);

  const toggle = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  const value = useMemo(() => ({ mode, isDark, setMode, toggle }), [mode, isDark, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
