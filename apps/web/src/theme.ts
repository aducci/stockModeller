// Light, dark, or the system's choice (design/04-ux/design-system.md §1). The choice is this browser's, kept in
// localStorage; the stylesheet reads it from data-theme on <html>, and with no data-theme follows the system.

export type Theme = "system" | "light" | "dark";

const KEY = "connectome.theme";

export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Shows the theme at once and remembers it for next time. */
export function applyTheme(theme: Theme, save = true): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (!save) return;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}
