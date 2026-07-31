import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "sentinel-theme";

function readStoredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

/** Dark is the default and only theme this app has ever shipped, so an unset or
 * corrupt localStorage value falls back to dark rather than guessing at the OS
 * preference — a returning user's screen should never change out from under them. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme(): void {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return [theme, toggleTheme];
}
