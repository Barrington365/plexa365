"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { readThemeModeFromDom, THEME_STORAGE_KEY, type ThemeMode } from "@/app/lib/theme-constants";

type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  /** False until client has synced localStorage + DOM (avoid toggle hydration mismatch). */
  themeReady: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type { ThemeMode } from "@/app/lib/theme-constants";

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return mode;
}

function applyThemeClass(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  document.body.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [themeReady, setThemeReady] = useState(false);

  useLayoutEffect(() => {
    const fromLs = localStorage.getItem(THEME_STORAGE_KEY);
    const initialMode: ThemeMode =
      fromLs === "light" || fromLs === "dark" || fromLs === "system"
        ? fromLs
        : readThemeModeFromDom();
    const initialResolved = resolveTheme(initialMode);
    setModeState(initialMode);
    setResolvedTheme(initialResolved);
    applyThemeClass(initialResolved);
    document.documentElement.setAttribute("data-theme-mode", initialMode);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolveTheme("system");
      setResolvedTheme(next);
      applyThemeClass(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    document.documentElement.setAttribute("data-theme-mode", nextMode);
    const nextResolved = resolveTheme(nextMode);
    setResolvedTheme(nextResolved);
    applyThemeClass(nextResolved);
  };

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      themeReady,
      setMode,
    }),
    [mode, resolvedTheme, themeReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
