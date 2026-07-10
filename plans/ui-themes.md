# UI Themes Implementation Plan

## Goal

Add theme support to the pi web viewer UI while maintaining the "no build step" constraint and
vanilla HTML/CSS/JS architecture. **v1 scope: exactly two themes — Default (dark, current look)
and Solarized Light — with Default as the default.** More themes (Solarized Dark, Gruvbox
Dark/Light, ...) are deferred until the mechanism and the color-variable coverage below have
proven out on two themes; see "Out of scope for v1".

## Current State

- Single dark theme defined via CSS custom properties in `:root` (`web/app.css`):
  `--bg`, `--fg`, `--muted`, `--bubble-user`, `--bubble-assistant`, `--bubble-tool`,
  `--bubble-error`, `--accent`, `--border`
- Already using `localStorage` for token persistence (`web/app.js`)
- No bundler or build step; `web/vendor/*.js` are prebuilt UMD libs loaded via plain `<script>`
  (see `AGENTS.md`); static assets are served from a hardcoded allowlist in
  `src/server.ts` (`STATIC_ASSETS`), not dynamic path resolution
- **Since the original draft of this plan, several colors were added to `app.css` that are
  *not* CSS variables** (markdown rendering + thinking chips):
  - `.markdown-body code` / `.markdown-body pre` — `background: rgba(255, 255, 255, 0.06–0.08)`,
    a white-tinted overlay tuned for a dark background. On a light theme this is nearly invisible
    (lightening something already near-white) or reads as a rendering bug.
  - `.tool-chip .tool-status.error` — hardcoded `color: #ff9a9a` (light pink text, assumes a dark
    error bubble behind it)
  - `#banner` — hardcoded `background: #4a3a1f; color: #ffd589` (fully unthemed)
  - `.pill.disconnected` — hardcoded `color: #e05a5a`
  - `#topbar` currently only ever holds two `.pill` elements; a theme toggle adds a third.

  These all need to become theme-aware before the light theme ships, or it will visibly break
  (invisible code blocks, low-contrast error/banner text). This is folded into the implementation
  steps below rather than left to manual QA to discover.

## Design

### Theme Architecture

**Key decision: CSS custom properties + inline `<style>` injection, toggle button (not a
dropdown)**

- Extend the existing `--*` variable approach (already proven)
- Define both themes as a plain JS object exported from `web/themes.js`
- Dynamically inject a `<style id="theme-styles">` tag with the active theme's variables
- Persist the theme choice to `localStorage` alongside the token
- **v1 UI is a single toggle button** (e.g. "☀︎ Light" / "☾ Dark" label swap), not the `<select>`
  dropdown from the original draft — with only two options a toggle is simpler and reads better
  in the cramped topbar. If a third theme lands later, swap the toggle for a `<select>`; the
  underlying `THEMES` map and `applyTheme()` already support N themes, so that swap only touches
  `setupThemeControl()`, not the storage/apply logic.

**Why inline stylesheet vs. separate CSS files per theme:**
- No extra HTTP requests, no additional `server.ts` static-asset routes beyond `themes.js` itself
- Single injection point simplifies switching (no CSS file swap/flash)
- Keeps theme data in JS where it's a plain object, not a parsed stylesheet

### Themes (v1: two)

#### 1. **Default** (current, dark) — also the default on first load

```javascript
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
}
```

#### 2. **Solarized Light**

Based on Ethan Schoonover's Solarized (base3 background, base03 text). The four new keys
(`codeBg`, `errorFg`, `warningBg`, `warningFg`, `danger`) are new for this plan — chosen for
contrast against this theme's light backgrounds, not carried over from the dark theme's values.

```javascript
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
}
```

(Exact hex values above are a starting point — spot-check actual contrast during implementation,
see Testing Checklist.)

### File Structure

```
web/
  index.html         (add theme toggle button markup)
  app.css            (remove :root color literals; replace hardcoded colors below with var()s)
  app.js             (add initTheme(), applyTheme(), setupThemeControl(); import THEMES)
  themes.js          (NEW — theme definitions, ES module, `export const THEMES`)
```

No `styles.css` split (the original draft mentioned one but never used it — dropped).

### Implementation Steps

#### 1. Create `web/themes.js`

```javascript
export const THEMES = {
  default: { name: "Default", colorScheme: "dark", bg: "#10121a", /* ... */ },
  solarizedLight: { name: "Solarized Light", colorScheme: "light", bg: "#fdf6e3", /* ... */ },
};
```

#### 2. Register `web/themes.js` as a static asset in `src/server.ts`

`STATIC_ASSETS` is a hardcoded allowlist (`src/server.ts`), by design (path-traversal safety,
see `AGENTS.md`) — new files don't get served automatically. Add:

```typescript
"/themes.js": { file: "themes.js", contentType: "text/javascript; charset=utf-8" },
```

This step is easy to forget (the original draft did) and the failure mode is a silent 404 on the
theme toggle doing nothing.

#### 3. Refactor `web/app.css`

- Remove color literals from `:root`, keep `color-scheme: light dark` as a fallback only (it gets
  overridden per-theme at runtime — see step 5)
- Replace every hardcoded color identified in "Current State" above with a `var()`:
  - `.markdown-body code`, `.markdown-body pre` → `background: var(--code-bg)`
  - `.tool-chip .tool-status.error` → `color: var(--error-fg)`
  - `#banner` → `background: var(--warning-bg); color: var(--warning-fg)`
  - `.pill.disconnected` → `color: var(--danger)`
- Everything else in `app.css` already references `var(--*)` and needs no change

#### 4. Add theme switching to `web/app.js`

```javascript
import { THEMES } from "./themes.js";

function initTheme() {
  const saved = localStorage.getItem("pi-web-viewer-theme");
  applyTheme(saved && THEMES[saved] ? saved : "default");
}

function applyTheme(themeId) {
  const theme = THEMES[themeId];
  if (!theme) return;

  const vars = Object.entries(theme)
    .filter(([k]) => k !== "name" && k !== "colorScheme")
    .map(([k, v]) => `--${camelToKebab(k)}: ${v};`)
    .join("\n");

  let styleEl = document.getElementById("theme-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "theme-styles";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `:root { ${vars} }`;
  document.documentElement.style.colorScheme = theme.colorScheme;

  localStorage.setItem("pi-web-viewer-theme", themeId);
  currentThemeId = themeId;
}

function camelToKebab(str) {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

let currentThemeId = "default";

function setupThemeControl() {
  const btn = document.getElementById("theme-toggle");
  const label = () => (currentThemeId === "default" ? "☾" : "☀︎");
  btn.textContent = label();
  btn.addEventListener("click", () => {
    applyTheme(currentThemeId === "default" ? "solarizedLight" : "default");
    btn.textContent = label();
  });
}

initTheme();
setupThemeControl();
```

`document.documentElement.style.colorScheme` (step: setting it per-theme) makes native controls —
the toggle button itself, `<textarea>` caret, scrollbars — follow the chosen theme instead of the
OS preference, which otherwise mismatches when e.g. Solarized Light is selected under a dark-mode
OS.

#### 5. Style the toggle button

Add to `web/app.css`:

```css
#theme-toggle {
  margin-left: auto;
  background: var(--bubble-assistant);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 999px;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}
```

#### 6. Update `web/index.html`

Add a button to `#topbar`, after the existing pills:

```html
<button id="theme-toggle" title="Toggle theme" aria-label="Toggle theme"></button>
```

No new `<script>` tag needed — `app.js` (`type="module"`) imports `themes.js` directly.

### Storage & Persistence

- Persist active theme id to `localStorage.pi-web-viewer-theme`
- Restore on page load, fallback to `"default"` if missing or unrecognized (e.g. an old value
  from a theme that no longer exists)
- No server-side persistence — purely client-side, same as the token

### Testing Checklist

- [ ] Load page with no saved theme → defaults to Default (dark)
- [ ] Toggle → Solarized Light applies instantly, toggle again → back to Default
- [ ] Refresh page → previously selected theme persists
- [ ] Code blocks and inline code readable in both themes (the `--code-bg` fix)
- [ ] Banner (`#banner`) readable in both themes
- [ ] Disconnected-state pill readable in both themes
- [ ] Tool-chip error status text readable in both themes
- [ ] Thinking-chip and tool-chip bodies readable in both themes
- [ ] Toggle button doesn't crowd the topbar on a real phone screen (conn-status + model-badge +
      toggle, three elements in one row)
- [ ] `localStorage` value from a removed/renamed theme id doesn't break `initTheme()`

## Out of Scope for v1

- Solarized Dark, Gruvbox Dark, Gruvbox Light, and any other additional palettes — add once the
  two-theme mechanism and the newly-themed elements (code/banner/error/danger colors) have proven
  out; each additional theme is still "10 lines of JS" per the original draft, just sequenced
  after v1 ships
- Switching the toggle to a `<select>` (only worth it once a 3rd theme exists)
- `prefers-color-scheme` auto-detection on first load
- User-authored custom themes (would need to sanitize/validate arbitrary color input before
  injecting into a `<style>` tag — not just a UI addition)
- Automated WCAG contrast validation
- Server-side theme persistence / cross-device sync
