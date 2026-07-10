// Theme definitions for the web viewer UI. See plans/ui-themes.md.
// Each theme maps to CSS custom properties applied to :root by applyTheme() in app.js
// (camelCase keys here become kebab-case --variables). "name" and "colorScheme" are metadata,
// not CSS variables — colorScheme drives document.documentElement.style.colorScheme so native
// controls (scrollbars, form controls) follow the chosen theme instead of the OS preference.
//
// Colors are Gruvbox (https://github.com/morhetz/gruvbox) — "neutral"/dark0-4/light0-4 tones for
// backgrounds and borders, "bright" tones for the dark theme's accents, "faded" tones for the
// light theme's (bright colors don't have enough contrast on a light background).

export const THEMES = {
  default: {
    name: "Gruvbox Dark",
    colorScheme: "dark",
    bg: "#282828", // gruvbox dark0
    fg: "#ebdbb2", // gruvbox light1
    muted: "#928374", // gruvbox gray
    bubbleUser: "#458588", // gruvbox neutral blue
    bubbleAssistant: "#3c3836", // gruvbox dark1
    bubbleTool: "#504945", // gruvbox dark2
    bubbleError: "#9d0006", // gruvbox faded red
    accent: "#fe8019", // gruvbox bright orange
    border: "#665c54", // gruvbox dark3
    codeBg: "#504945", // gruvbox dark2
    errorFg: "#fb4934", // gruvbox bright red
    warningBg: "#453a1f",
    warningFg: "#fabd2f", // gruvbox bright yellow
    danger: "#fb4934", // gruvbox bright red
  },
  gruvboxLight: {
    name: "Gruvbox Light",
    colorScheme: "light",
    bg: "#fbf1c7", // gruvbox light0
    fg: "#3c3836", // gruvbox dark1
    muted: "#928374", // gruvbox gray
    bubbleUser: "#076678", // gruvbox faded blue
    bubbleAssistant: "#ebdbb2", // gruvbox light1
    bubbleTool: "#d5c4a1", // gruvbox light2
    bubbleError: "#9d0006", // gruvbox faded red
    accent: "#af3a03", // gruvbox faded orange
    border: "#bdae93", // gruvbox light3
    codeBg: "rgba(60, 56, 54, 0.1)",
    errorFg: "#fff5f5",
    warningBg: "#f2e5bc",
    warningFg: "#b57614", // gruvbox faded yellow
    danger: "#9d0006", // gruvbox faded red
  },
};
