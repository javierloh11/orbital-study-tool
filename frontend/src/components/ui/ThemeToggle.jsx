import { useEffect, useState } from "react";
import Icon from "./Icon";

const STORAGE_KEY = "stitch-theme";

function getInitialTheme() {
  // index.html sets data-theme before first paint; trust it if present.
  const applied = document.documentElement.getAttribute("data-theme");
  if (applied === "light" || applied === "dark") {
    return applied;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // localStorage unavailable — fall through to system preference.
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures (private mode etc.).
    }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="btn btn-icon"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
    </button>
  );
}
