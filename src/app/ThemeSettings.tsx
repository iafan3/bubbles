"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeSettings.module.css";

type ThemeFamily = "claude" | "sage" | "lavender";
type ThemeMode = "system" | "light" | "dark";

const familyOptions: Array<{ value: ThemeFamily; label: string }> = [
  { value: "claude", label: "Claude" },
  { value: "sage", label: "Sage" },
  { value: "lavender", label: "Lavender" },
];

const modeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function isThemeFamily(value: string | null): value is ThemeFamily {
  return value === "claude" || value === "sage" || value === "lavender";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function getSystemMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
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

  window.localStorage.setItem("bubbles-theme-family", family);
  window.localStorage.setItem("bubbles-theme-mode", mode);
  window.localStorage.setItem("bubbles-theme", resolvedMode);
  window.dispatchEvent(
    new CustomEvent("bubbles-theme-change", {
      detail: { family, mode, resolvedMode },
    })
  );
}

export default function ThemeSettings() {
  const [family, setFamily] = useState<ThemeFamily>(() => {
    if (typeof window === "undefined") return "claude";

    const savedFamily = window.localStorage.getItem("bubbles-theme-family");
    return isThemeFamily(savedFamily) ? savedFamily : "claude";
  });

  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";

    const savedMode = window.localStorage.getItem("bubbles-theme-mode");
    return isThemeMode(savedMode) ? savedMode : "system";
  });

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
          {familyOptions.map((option) => (
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
          {modeOptions.map((option) => (
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
