# UI Themes Implementation Plan

## Goal

Add theme support to the pi web viewer UI (Solarized, Gruvbox, default) while maintaining the "no build step" constraint and vanilla HTML/CSS/JS architecture.

## Current State

- Single dark theme defined via CSS custom properties in `:root`
- Existing variables: `--bg`, `--fg`, `--muted`, `--bubble-user`, `--bubble-assistant`, `--bubble-tool`, `--bubble-error`, `--accent`, `--border`
- Already using `localStorage` for token persistence
- No bundler or build step

## Design

### Theme Architecture

**Key Decision: CSS Custom Properties (Variables) + Inline Stylesheet**
- Extend the existing `--*` variable approach (already proven)
- Define all themes as JavaScript objects (not separate CSS files)
- Dynamically inject a `<style>` tag with the active theme's variables
- Persist the theme choice to `localStorage` alongside the token

**Why inline stylesheets vs. separate files:**
- No HTTP requests needed, no file-serving changes to `server.ts`
- Single stylesheet injection simplifies theme switching (no CSS file downloads)
- Keeps all theme data in JavaScript where it's queryable
- Consistent with "no build step" — themes defined directly in code

### Predefined Themes

Create a `themes.js` object with the following themes:

#### 1. **Default** (current)
```javascript
default: {
  name: "Default",
  bg: "#10121a",
  fg: "#e8e9ee",
  muted: "#8a8d9a",
  bubbleUser: "#2b5fd9",
  bubbleAssistant: "#1e2130",
  bubbleTool: "#2a2416",
  bubbleError: "#4a1f24",
  accent: "#5b8dff",
  border: "#2a2d3c",
}
```

#### 2. **Solarized Dark**
- Based on Ethan Schoonover's Solarized
- Warm, easy on the eyes, excellent contrast
- Colors: base03 (#002b36) background, base0 (#839496) text

```javascript
solarizedDark: {
  name: "Solarized Dark",
  bg: "#002b36",
  fg: "#839496",
  muted: "#586e75",
  bubbleUser: "#268bd2",
  bubbleAssistant: "#073642",
  bubbleTool: "#1f3f4e",
  bubbleError: "#7a3535",
  accent: "#2aa198",
  border: "#073642",
}
```

#### 3. **Solarized Light**
- Light variant, high contrast, office-friendly
- Colors: base3 (#fdf6e3) background, base03 (#002b36) text

```javascript
solarizedLight: {
  name: "Solarized Light",
  bg: "#fdf6e3",
  fg: "#002b36",
  muted: "#586e75",
  bubbleUser: "#268bd2",
  bubbleAssistant: "#eee8d5",
  bubbleTool: "#f5f1e8",
  bubbleError: "#d64949",
  accent: "#2aa198",
  border: "#e5dcc9",
}
```

#### 4. **Gruvbox Dark**
- Based on gruvbox by Pavel Pertsev
- Retro groove, warm colors, high contrast
- Colors: dark0 (#282828) background, fg (#ebdbb2) text

```javascript
gruvboxDark: {
  name: "Gruvbox Dark",
  bg: "#282828",
  fg: "#ebdbb2",
  muted: "#a89984",
  bubbleUser: "#83a598",
  bubbleAssistant: "#3c3836",
  bubbleTool: "#5d4e37",
  bubbleError: "#702020",
  accent: "#d3869b",
  border: "#504945",
}
```

#### 5. **Gruvbox Light**
- Light variant, warm neutrals, vintage look
- Colors: light0 (#fbf1c7) background, dark0_hard (#1d2021) text

```javascript
gruvboxLight: {
  name: "Gruvbox Light",
  bg: "#fbf1c7",
  fg: "#3c3836",
  muted: "#928374",
  bubbleUser: "#076678",
  bubbleAssistant: "#f3ead0",
  bubbleTool: "#f0e8d8",
  bubbleError: "#cc241d",
  accent: "#8f3f71",
  border: "#e8dcc9",
}
```

### File Structure

```
web/
  index.html         (add theme picker UI)
  app.css            (keep existing, remove :root color definitions)
  app.js             (expand with theme switching logic)
  themes.js          (NEW — all theme definitions)
  styles.css         (NEW — CSS framework without colors, injected dynamically)
```

### Implementation Steps

#### 1. Create `web/themes.js`
```javascript
// All theme definitions as a simple JavaScript object.
// Each theme maps to CSS custom property names.
const THEMES = {
  default: { name: "Default", bg: "#10121a", fg: "#e8e9ee", /* ... */ },
  solarizedDark: { name: "Solarized Dark", bg: "#002b36", /* ... */ },
  solarizedLight: { name: "Solarized Light", bg: "#fdf6e3", /* ... */ },
  gruvboxDark: { name: "Gruvbox Dark", bg: "#282828", /* ... */ },
  gruvboxLight: { name: "Gruvbox Light", bg: "#fbf1c7", /* ... */ },
};

export { THEMES };
```

#### 2. Refactor `web/app.css`
- Remove color definitions from `:root`
- Keep all structural CSS (layout, spacing, typography)
- Keep CSS custom property *references* (e.g., `background: var(--bg)`)
- Result: a neutral skeleton that works with any theme

**Before:**
```css
:root {
  color-scheme: light dark;
  --bg: #10121a;
  --fg: #e8e9ee;
  /* ... */
}
```

**After:**
```css
:root {
  color-scheme: light dark;
}

body {
  background: var(--bg);
  color: var(--fg);
  /* ... */
}
```

#### 3. Add Theme Switching to `web/app.js`
```javascript
import { THEMES } from "./themes.js";

// Initialize theme on load
function initTheme() {
  const saved = localStorage.getItem("pi-web-viewer-theme") || "default";
  if (THEMES[saved]) {
    applyTheme(saved);
  } else {
    applyTheme("default");
  }
}

function applyTheme(themeId) {
  const theme = THEMES[themeId];
  if (!theme) return;

  // Inject CSS variables as a <style> tag
  const themeVars = Object.entries(theme)
    .filter(([k]) => k !== "name") // Skip metadata
    .map(([k, v]) => `--${camelToKebab(k)}: ${v};`)
    .join("\n");

  let styleEl = document.getElementById("theme-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "theme-styles";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `:root { ${themeVars} }`;

  localStorage.setItem("pi-web-viewer-theme", themeId);
}

function camelToKebab(str) {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

// Add theme picker to topbar
function setupThemePicker() {
  const topbar = document.getElementById("topbar");
  const themeSelect = document.createElement("select");
  themeSelect.id = "theme-select";
  themeSelect.className = "theme-picker";

  Object.entries(THEMES).forEach(([id, theme]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = theme.name;
    themeSelect.appendChild(opt);
  });

  themeSelect.value = localStorage.getItem("pi-web-viewer-theme") || "default";
  themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));

  topbar.appendChild(themeSelect);
}

// Call on init
initTheme();
setupThemePicker();
```

#### 4. Style the Theme Picker
Add to `web/app.css`:
```css
.theme-picker {
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bubble-assistant);
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
  margin-left: auto; /* Right-align in topbar */
}

.theme-picker:hover {
  background: var(--accent);
  opacity: 0.8;
}
```

#### 5. Update `web/index.html`
```html
<!-- Add import for themes.js -->
<script type="module" src="themes.js"></script>
<!-- Rest of HTML unchanged -->
```

### Color Variable Mapping

Map camelCase theme object keys to CSS custom properties:

| Theme Key | CSS Variable |
|---|---|
| `bg` | `--bg` |
| `fg` | `--fg` |
| `muted` | `--muted` |
| `bubbleUser` | `--bubble-user` |
| `bubbleAssistant` | `--bubble-assistant` |
| `bubbleTool` | `--bubble-tool` |
| `bubbleError` | `--bubble-error` |
| `accent` | `--accent` |
| `border` | `--border` |

### Storage & Persistence

- Persist active theme to `localStorage.pi-web-viewer-theme`
- Restore on page load (fallback to `"default"` if missing or invalid)
- No server-side persistence needed — purely client-side

### Browser Compatibility

- CSS custom properties: all modern browsers (no IE11 support, acceptable)
- `<style>` tag injection: universal
- `localStorage`: universal
- No vendor prefixes needed for variables in 2026

### Optional Enhancements (Post-v1)

1. **System Preference Detection**
   ```javascript
   if (localStorage.getItem("pi-web-viewer-theme") === null) {
     const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
     applyTheme(prefersLight ? "solarizedLight" : "solarizedDark");
   }
   ```

2. **User Custom Themes**
   - Store in `localStorage` as JSON
   - Add a "Create Custom Theme" UI
   - Export/import theme JSON via QR code or file download

3. **Additional Themes**
   - Dracula, Nord, One Dark, GitHub Light/Dark
   - Contributed by users via PRs to `themes.js`

4. **Accessibility**
   - Add WCAG AA contrast checker to theme validation
   - Warn if a theme fails accessibility standards

5. **Theme Sync**
   - Persist theme preference server-side (user profile, if multi-user ever lands)
   - Sync across devices

### Testing Checklist

- [ ] Load page with no saved theme → defaults to `"default"`
- [ ] Select each theme from picker → UI updates instantly
- [ ] Refresh page → previously selected theme loads
- [ ] All markdown elements render correctly in light and dark themes
- [ ] Tool chips readable in all themes
- [ ] Thinking chips readable in all themes
- [ ] Buttons have sufficient contrast in all themes
- [ ] Test on actual phone in browser (light vs. dark system preference)

### Files to Modify/Create

**Create:**
- `web/themes.js` — theme definitions (120 lines)
- `plans/ui-themes.md` — this plan

**Modify:**
- `web/app.js` — add `initTheme()`, `applyTheme()`, `setupThemePicker()` (50 lines)
- `web/app.css` — remove color values from `:root`, add `.theme-picker` styles (15 lines)
- `web/index.html` — import `themes.js` (1 line change)

**Total new/modified code:** ~185 lines (lightweight, no dependencies)

## Why This Approach

✅ **No build step** — pure JavaScript module, no transpilation  
✅ **Lightweight** — ~4KB themes.js, no CSS duplication  
✅ **Fast switching** — instant, no network requests  
✅ **Extensible** — adding new themes is 10 lines of JavaScript  
✅ **Accessible** — can add contrast validation  
✅ **Testable** — smoke tests can verify theme switching  
✅ **Phone-friendly** — respects `prefers-color-scheme` media query if desired  
✅ **Consistent** — uses existing variable pattern, no new CSS paradigms  

## Out of Scope for v1

- CSS file bundling or Sass preprocessing
- Server-side theme persistence
- Theme editor UI
- Real-time system preference sync
