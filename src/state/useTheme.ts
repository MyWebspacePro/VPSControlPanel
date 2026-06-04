import { useEffect, useState } from "react";
import { load, Store } from "@tauri-apps/plugin-store";

type Theme = "system" | "light" | "dark";

const THEME_KEY = "ui.theme";
const STORE_FILE = "settings.json";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return storePromise;
}

export function useTheme(): [Theme, (t: Theme) => void, () => "light" | "dark"] {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    let mounted = true;
    getStore()
      .then((s) => s.get<Theme>(THEME_KEY))
      .then((stored) => {
        if (mounted && stored) setThemeState(stored);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const wantsDark =
        theme === "dark" || (theme === "system" && mql.matches);
      document.documentElement.classList.toggle("dark", wantsDark);
      setResolved(wantsDark ? "dark" : "light");
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    getStore()
      .then((s) => s.set(THEME_KEY, t))
      .catch(() => {});
  };

  return [theme, setTheme, () => resolved];
}
