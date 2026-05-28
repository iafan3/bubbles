"use client";

import { useEffect } from "react";
import { applyTheme, getSavedThemeFamily, getSavedThemeMode } from "@/lib/theme";

export default function ThemeBoot() {
  useEffect(() => {
    const family = getSavedThemeFamily();
    const mode = getSavedThemeMode();
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
