/** localStorage key — keep in sync with `getThemeBootstrapScript()`. */
export const THEME_STORAGE_KEY = "plexa-theme-mode";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Runs before React (Next `beforeInteractive`). Applies `light` | `dark` on
 * `<html>` from saved mode + OS preference, and sets `data-theme-mode` for hydration.
 */
export function getThemeBootstrapScript(): string {
  const k = JSON.stringify(THEME_STORAGE_KEY);
  return `!function(){try{var k=${k};var m=localStorage.getItem(k);if(m!=="light"&&m!=="dark"&&m!=="system"){m=(localStorage.getItem("plexa-studio-theme")==="dark"||localStorage.getItem("plexa-theme")==="dark"||localStorage.getItem("msn-local-theme")==="dark")?"dark":"system";try{localStorage.setItem(k,m);}catch(e){}}document.documentElement.setAttribute("data-theme-mode",m);var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var apply=function(){document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(d?"dark":"light");if(document.body)document.body.classList.toggle("dark",d);};apply();document.addEventListener("DOMContentLoaded",apply);}catch(e){document.documentElement.classList.add("light");document.documentElement.setAttribute("data-theme-mode","system");}}();`;
}

export function readThemeModeFromDom(): ThemeMode {
  if (typeof document === "undefined") return "system";
  const m = document.documentElement.getAttribute("data-theme-mode");
  if (m === "light" || m === "dark" || m === "system") return m;
  return "system";
}
