// Theme handling. Persisted in localStorage under STORAGE_KEY. The default
// theme is "dark" (night mode). To avoid race conditions on mobile (where
// multiple route mounts could re-apply a stale value), we cache the last
// applied theme and skip redundant DOM writes; the actual storage write
// only happens on explicit user changes via setTheme().
const STORAGE_KEY = "voltica-theme";

export type Theme = "dark" | "light";

let lastApplied: Theme | null = null;

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (lastApplied === theme) return;
  lastApplied = theme;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
