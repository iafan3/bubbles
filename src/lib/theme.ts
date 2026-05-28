export type ThemeFamily = "claude" | "sage" | "lavender";
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";

export const THEME_FAMILY_OPTIONS: Array<{
  value: ThemeFamily;
  label: string;
}> = [
  { value: "claude", label: "Claude" },
  { value: "sage", label: "Sage" },
  { value: "lavender", label: "Lavender" },
];

export const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function isThemeFamily(value: string | null): value is ThemeFamily {
  return value === "claude" || value === "sage" || value === "lavender";
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function getSystemMode(): ResolvedThemeMode {
  if (typeof window === "undefined") return "light";

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getSavedThemeFamily(): ThemeFamily {
  if (typeof window === "undefined") return "claude";

  const savedFamily = window.localStorage.getItem("bubbles-theme-family");
  return isThemeFamily(savedFamily) ? savedFamily : "claude";
}

export function getSavedThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";

  const savedMode = window.localStorage.getItem("bubbles-theme-mode");
  return isThemeMode(savedMode) ? savedMode : "system";
}

export function getSavedResolvedTheme(): ResolvedThemeMode {
  if (typeof window === "undefined") return "dark";

  const savedTheme = window.localStorage.getItem("bubbles-theme");
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;

  return getSystemMode();
}

export function applyTheme(family: ThemeFamily, mode: ThemeMode) {
  if (typeof window === "undefined") return "light";

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

  return resolvedMode;
}

export function toggleSavedResolvedTheme() {
  const nextTheme = getSavedResolvedTheme() === "dark" ? "light" : "dark";
  const family = getSavedThemeFamily();

  applyTheme(family, nextTheme);

  return nextTheme;
}
