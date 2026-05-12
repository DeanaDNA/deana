import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, type ThemeMode } from "./settings";
import { ThemeProvider, useTheme } from "./theme";

function createMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  return {
    media,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: media.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function Probe() {
  const { mode, isDark, setMode, toggle } = useTheme();

  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{isDark ? "dark" : "light"}</span>
      <button type="button" onClick={() => setMode("system")}>System</button>
      <button type="button" onClick={() => setMode("light")}>Light</button>
      <button type="button" onClick={() => setMode("dark")}>Dark</button>
      <button type="button" onClick={toggle}>Toggle</button>
    </div>
  );
}

function expectSavedThemeMode(themeMode: ThemeMode) {
  expect(loadSettings()).toMatchObject({ themeMode });
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.head.innerHTML = '<meta name="theme-color" content="#103f35" />';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system mode and follows OS preference changes", () => {
    const matchMedia = createMatchMediaMock(true);
    vi.spyOn(window, "matchMedia").mockReturnValue(matchMedia.media);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", "#1b1916");

    act(() => matchMedia.setMatches(false));

    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", "#103f35");
  });

  it("keeps explicit mode overrides when OS preference changes", () => {
    const matchMedia = createMatchMediaMock(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(matchMedia.media);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole("button", { name: "Dark" }).click());
    act(() => matchMedia.setMatches(false));

    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expectSavedThemeMode("dark");
  });

  it("uses the quick toggle as an explicit light or dark override", () => {
    const matchMedia = createMatchMediaMock(true);
    vi.spyOn(window, "matchMedia").mockReturnValue(matchMedia.media);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole("button", { name: "Toggle" }).click());

    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expectSavedThemeMode("light");
  });
});
