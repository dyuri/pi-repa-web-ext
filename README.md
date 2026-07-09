# pi-repa-web-ext

A [pi](https://github.com/earendil-works/pi) TUI extension that mirrors the current interactive
session to a browser in real time, so you can check on (and reply to) a `pi` session running on
your desktop from another device on the same network — e.g. your phone from the couch.

See [`plans/web-interface-extension.md`](plans/web-interface-extension.md) for the full design
rationale (architecture choice, wire protocol, security model, and what's explicitly out of scope
for v1).

## Requirements

- Node.js
- pi installed, with a working session (this extension reuses whatever auth/model config `pi`
  itself already has on this machine — nothing extra to set up)

## Install

```bash
npm install
```

This installs `ws` (a real runtime dependency — the extension's HTTP/WS server needs it) and
`@earendil-works/pi-coding-agent` (types only, for local editing/type-checking).

Then either:

- **Quick test**: `pi -e /path/to/pi-repa-web-ext/src/index.ts`
- **Persistent / auto-discovered**: symlink this repo into pi's extensions directory so it loads
  automatically and hot-reloads with `/reload`:

  ```bash
  ln -s "$(pwd)" ~/.pi/agent/extensions/pi-repa-web-ext   # global
  # or: ln -s "$(pwd)" .pi/extensions/pi-repa-web-ext      # project-local
  ```

## Usage

On session start, the extension starts an HTTP+WS server (default `0.0.0.0:4390`) and shows its
status in the footer. Commands available in the TUI:

| Command | Effect |
|---|---|
| `/web-viewer-url` | Print the bookmarkable URL (includes the access token) |
| `/web-viewer-rotate-token` | Issue a new token and disconnect existing clients |
| `/web-viewer-stop` | Stop the server (persists across restarts) |
| `/web-viewer-start` | Start the server |

`--web-viewer=false` disables it for a single run without touching the persisted setting.

Open the printed URL on your phone (same network as the desktop) to watch the session live and
send prompts. Replies you send are delivered the same way `pi.sendUserMessage()` would deliver
anything else — steered in if the agent is mid-turn, sent immediately if idle.

## Configuration

Persisted at `~/.pi/agent/pi-web-viewer/config.json` (file mode `600`):

```json
{ "host": "0.0.0.0", "port": 4390, "token": "...", "enabled": true }
```

Edit directly if needed. The token is generated once and reused across restarts and session
switches (`/new`, `/resume`, ...) so your bookmarked URL keeps working; `/web-viewer-rotate-token`
is the supported way to change it.

## Security

Read the "Security" section in
[`plans/web-interface-extension.md`](plans/web-interface-extension.md) before exposing this
beyond a machine you trust. Short version: it's deliberately LAN-reachable by default (that's the
point), auth is a single bearer token over plain HTTP (no TLS), and a prompt sent from the browser
has exactly the same power as typing at the keyboard — including bash/write/edit if those tools
are active in your session. Use Tailscale/WireGuard if you want access beyond your LAN.

## Development

- No build step for the extension — pi loads TypeScript extensions directly via
  [jiti](https://github.com/unjs/jiti). `web/` is plain static HTML/CSS/JS, also no build step.
- `npm run check` — type-check with `tsc --noEmit`.
- `scripts/smoke-test/*.mjs` — manual smoke tests that load the extension into a real
  `pi --mode rpc` process and drive it over stdin/stdout + a real WS client. See `AGENTS.md` for
  how/when to use and update these.

## Architecture

```
src/
  index.ts      extension factory: wires pi's event stream -> broadcast, owns server lifecycle
  server.ts     HTTP+WS server: token-gated static assets, /ws upgrade, broadcast()
  wire.ts       wire message types; documents which pi events pass through verbatim
  state.ts      derives {isStreaming, hasPendingMessages, model, thinkingLevel} from ExtensionContext
  config.ts     load/save ~/.pi/agent/pi-web-viewer/config.json
  network.ts    picks a LAN-displayable address when bound to 0.0.0.0
  commands.ts   /web-viewer-* command registration
web/
  index.html, app.css, app.js   vanilla chat UI, no framework/bundler
```
