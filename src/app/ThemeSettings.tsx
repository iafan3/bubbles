"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getSavedThemeFamily,
  getSavedThemeMode,
  THEME_FAMILY_OPTIONS,
  THEME_MODE_OPTIONS,
  type ThemeFamily,
  type ThemeMode,
} from "@/lib/theme";
import styles from "./ThemeSettings.module.css";

export default function ThemeSettings() {
  const [family, setFamily] = useState<ThemeFamily>(getSavedThemeFamily);
  const [mode, setMode] = useState<ThemeMode>(getSavedThemeMode);

  useEffect(() => {
    applyTheme(family, mode);

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange() {
      if (mode === "system") {
        applyTheme(family, "system");
      }
    }

    media.addEventListener("change", handleSystemThemeChange);

    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [family, mode]);

  function chooseFamily(nextFamily: ThemeFamily) {
    setFamily(nextFamily);
    applyTheme(nextFamily, mode);
  }

  function chooseMode(nextMode: ThemeMode) {
    setMode(nextMode);
    applyTheme(family, nextMode);
  }

  return (
    <section className={styles.appearancePanel} aria-labelledby="appearance-heading">
      <div className={styles.appearanceHeader}>
        <h2 id="appearance-heading">Appearance</h2>
        <p>Choose the app palette and whether Bubbles follows your system theme.</p>
      </div>

      <fieldset className={styles.controlGroup}>
        <legend>Theme family</legend>
        <div className={styles.segmented}>
          {THEME_FAMILY_OPTIONS.map((option) => (
            <button
              className={`${styles.optionButton} ${
                family === option.value ? styles.optionButtonActive : ""
              }`}
              type="button"
              key={option.value}
              onClick={() => chooseFamily(option.value)}
              aria-pressed={family === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>Mode</legend>
        <div className={styles.segmented}>
          {THEME_MODE_OPTIONS.map((option) => (
            <button
              className={`${styles.optionButton} ${
                mode === option.value ? styles.optionButtonActive : ""
              }`}
              type="button"
              key={option.value}
              onClick={() => chooseMode(option.value)}
              aria-pressed={mode === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <p className={styles.note}>
        System follows your device or browser light/dark preference. Your choice is saved on this device.
      </p>
    </section>
  );
}
