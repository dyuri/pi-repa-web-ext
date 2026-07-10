// Theme definitions for the web viewer UI. See plans/ui-themes.md.
// Each theme maps to CSS custom properties applied to :root by applyTheme() in app.js
// (camelCase keys here become kebab-case --variables). "name" and "colorScheme" are metadata,
// not CSS variables — colorScheme drives document.documentElement.style.colorScheme so native
// controls (scrollbars, form controls) follow the chosen theme instead of the OS preference.

export const THEMES = {
  default: {
    name: "Default",
    colorScheme: "dark",
    bg: "#10121a",
    fg: "#e8e9ee",
    muted: "#8a8d9a",
    bubbleUser: "#2b5fd9",
    bubbleAssistant: "#1e2130",
    bubbleTool: "#2a2416",
    bubbleError: "#4a1f24",
    accent: "#5b8dff",
    border: "#2a2d3c",
    codeBg: "rgba(255, 255, 255, 0.08)",
    errorFg: "#ff9a9a",
    warningBg: "#4a3a1f",
    warningFg: "#ffd589",
    danger: "#e05a5a",
  },
  solarizedLight: {
    name: "Solarized Light",
    colorScheme: "light",
    bg: "#fdf6e3",
    fg: "#002b36",
    muted: "#586e75",
    bubbleUser: "#268bd2",
    bubbleAssistant: "#eee8d5",
    bubbleTool: "#f5f1e8",
    bubbleError: "#d64949",
    accent: "#2aa198",
    border: "#e5dcc9",
    codeBg: "rgba(0, 0, 0, 0.06)",
    errorFg: "#fff5f5",
    warningBg: "#fdf3d3",
    warningFg: "#7a5f00",
    danger: "#c0392b",
  },
};
