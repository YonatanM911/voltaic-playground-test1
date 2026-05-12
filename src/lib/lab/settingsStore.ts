// Voltica Laboratories — global app settings (persisted in localStorage)
// Holds default display units for V/A/Ω + UI preferences (showNames).
import { useEffect, useState } from "react";
import type { Quantity } from "./units";

export interface AppSettings {
  defaultUnit: Record<Quantity, string>; // e.g. { voltage: "V", ... }
  showNames: boolean;
  showElectronFlow: boolean;
}

const KEY = "voltica-settings-v2";

const DEFAULTS: AppSettings = {
  defaultUnit: { voltage: "V", current: "A", resistance: "Ω" },
  showNames: true,
  showElectronFlow: true,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, defaultUnit: { ...DEFAULTS.defaultUnit, ...(parsed.defaultUnit ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: AppSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("voltica-settings", { detail: s }));
}

export function useAppSettings(): [AppSettings, (s: Partial<AppSettings>) => void] {
  const [s, setS] = useState<AppSettings>(() => loadSettings());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail;
      if (detail) setS(detail);
    };
    window.addEventListener("voltica-settings", onChange);
    return () => window.removeEventListener("voltica-settings", onChange);
  }, []);
  const update = (patch: Partial<AppSettings>) => {
    const next = { ...s, ...patch, defaultUnit: { ...s.defaultUnit, ...(patch.defaultUnit ?? {}) } };
    setS(next);
    saveSettings(next);
  };
  return [s, update];
}
