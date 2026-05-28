"use client";

import { useEffect } from "react";

type ThemeFamily = "claude" | "sage" | "lavender";
type ThemeMode = "system" | "light" | "dark";

function isThemeFamily(value: string | null): value is ThemeFamily {
  return value === "claude" || value === "sage" || value === "lavender";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function getSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(family: ThemeFamily, mode: ThemeMode) {
  const resolvedMode = mode === "system" ? getSystemMode() : mode;

  for (const element of [document.documentElement, document.body]) {
    element.dataset.bubblesThemeFamily = family;
    element.dataset.bubblesThemeMode = mode;
    element.dataset.bubblesResolvedMode = resolvedMode;
    element.dataset.bubblesTheme = `${family}-${resolvedMode}`;
  }

  window.localStorage.setItem("bubbles-theme", resolvedMode);
}

export default function ThemeBoot() {
  useEffect(() => {
    const savedFamily = window.localStorage.getItem("bubbles-theme-family");
    const savedMode = window.localStorage.getItem("bubbles-theme-mode");
    const family = isThemeFamily(savedFamily) ? savedFamily : "claude";
    const mode = isThemeMode(savedMode) ? savedMode : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    applyTheme(family, mode);

    function handleSystemThemeChange() {
      if (mode === "system") applyTheme(family, mode);
    }

    media.addEventListener("change", handleSystemThemeChange);

    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, []);

  return null;
}
