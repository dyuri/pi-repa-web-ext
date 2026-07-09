# Web viewer extension for the pi TUI

## Goal

A pi **extension** (TypeScript module loaded into the running `pi` TUI process) that mirrors the *current* interactive session to a browser in real time, and lets you reply from that browser. Use case: start `pi` on the desktop, walk to the couch, open a bookmarked URL on the phone, watch the agent work, answer a question it asked, keep walking away. This is a companion to the running TUI, not a replacement for it — the TUI stays the source of truth and the only place sessions are created/switched/configured.

This is a **separate project** from `pi-repa-web` (the standalone multi-session SDK server). Different problem: that one *runs* agent sessions headlessly; this one *observes and steers* a session someone is already running interactively in a terminal.

## Architecture decision

**Extension, not a subprocess or SDK server.** Extensions run inside the actual `pi` process (`packages/coding-agent/docs/extensions.md`) and get:

- `pi.on(eventName, handler)` for the same event stream that RPC mode exposes on stdout (`agent_start`, `message_update` with streaming `assistantMessageEvent` deltas, `tool_execution_start/update/end`, `turn_start/end`, `session_compact`, etc.) — no hand-rolled event translation layer needed, the shapes already match `docs/rpc.md`.
- `ctx.sessionManager.getBranch()` for the full transcript of the active session, for hydrating a browser tab that connects mid-conversation.
- `pi.sendUserMessage(text, { deliverAs })` to inject a message *as if typed by the user* — this is how a phone reply reaches the agent, automatically composing with whatever the person at the keyboard is doing (steer/follow-up queueing is pi's existing machinery, not something this extension reimplements).
- `ctx.abort()`, `ctx.isIdle()`, `ctx.hasPendingMessages()` for control/state.
- `pi.registerCommand()` / `pi.registerFlag()` for `/web-viewer-*` commands and a `--web-viewer` startup flag.

The extension starts a small HTTP+WS server from `session_start` and stops it in `session_shutdown` (the documented pattern for long-lived resources — the factory function itself must not start background listeners, since it also runs for invocations that never start a session).

No custom tools, no tool-call interception — this extension only *observes* the agent loop and *injects user messages*, it doesn't change how the agent behaves.

## Repo layout

```
pi-repa-web-ext/
  package.json            # "pi": { "extensions": ["./src/index.ts"] }, deps: ws
  package-lock.json
  tsconfig.json
  src/
    index.ts              # extension factory: wires events -> broadcast, registers commands/flag
    server.ts             # http server: static web/ assets, /ws upgrade, token check, broadcast()
    wire.ts               # SessionEntry[] -> hydrate payload; pass-through event shaping
    state.ts              # tracks isStreaming/hasPendingMessages/model/thinkingLevel, emits "state" deltas
    config.ts             # reads/writes ~/.pi/agent/pi-web-viewer/config.json (host, port, token)
    commands.ts           # /web-viewer-url, /web-viewer-rotate-token, /web-viewer-stop, /web-viewer-start
  web/
    index.html            # single static page, no build step
    app.js                # vanilla JS: WS client, render, composer
    app.css
  plans/
    web-interface-extension.md
```

**Deliberately no bundler/framework** for `web/` — the extensions doc shows extensions ship as plain TypeScript (run via `jiti`, no compile step) plus arbitrary static assets. A single HTML/CSS/JS file is enough for a chat view + composer, and it keeps this project genuinely lightweight, in contrast to `pi-repa-web`'s Vite+React app. Flag this if you'd rather have a proper frontend build (e.g. if you want to reuse `pi-repa-web`'s `ChatView`/`ToolCallItem` React components) — the wire protocol below is close enough to that project's that porting components later stays plausible.

**Package style**: the npm-package extension layout (`package.json` with a `"pi": { "extensions": [...] }` manifest, per `docs/extensions.md`), because we need the `ws` dependency. Same layout lets you distribute it later via `pi install git:...`. For local dev, either symlink this repo into `~/.pi/agent/extensions/` or `.pi/extensions/`, or run `pi -e ./src/index.ts` for quick iteration.

## How this differs from pi-repa-web (important asymmetry)

| | pi-repa-web | this extension |
|---|---|---|
| Runs | standalone Node server, own process | inside the `pi` TUI process you're already running |
| Sessions | creates/owns N `AgentSession`s via SDK | mirrors the *one* session the TUI already has open |
| Session switching | via registry API | not supported from the browser — TUI remains in control (`/new`, `/resume`, etc. all happen at the keyboard) |
| Lifecycle | server outlives any browser tab | server lifecycle == TUI session lifecycle (see below) |
| Network exposure | localhost-only by default | **must** be LAN-reachable for the couch/phone use case — this is the whole point, so the security posture is different (see Security) |

## Session replacement lifecycle

`/new`, `/resume`, `/fork`, `/clone`, and `/reload` all emit `session_shutdown` for the current extension instance and `session_start` for a fresh one (per `docs/extensions.md`, "Session replacement lifecycle and footguns"). This extension's server therefore stops and restarts across those actions. To make that invisible-ish to the phone:

- Host/port/token are persisted to `~/.pi/agent/pi-web-viewer/config.json` and reused across restarts, so the bookmarked URL never changes.
- The web client auto-reconnects on drop (with backoff) and re-requests hydration on reconnect, so a `/resume` on the desktop just looks like a brief "reconnecting…" flicker on the phone, then the new session's transcript.
- `session_shutdown`'s `event.reason` distinguishes `"quit"` (real exit — stop for good) from `"reload" | "new" | "resume" | "fork"` (session replacement — expect a fast `session_start` right after). No behavior difference planned for v1 beyond this note; if the restart-per-switch proves janky in practice, investigate whether module-level state can survive extension reload to avoid dropping the socket at all. Not required for v1.

## Wire protocol (browser <-> extension)

Single WebSocket, `GET /ws?token=...`. No separate REST surface needed (there's only ever one session to attach to).

**Server → client**, mostly a pass-through of the extension event payloads (which already match `docs/rpc.md`'s event shapes) plus two extension-specific envelope types:

```json
{"type": "hydrate", "entries": [...session entries on the active branch...], "state": {...}}
{"type": "state", "isStreaming": false, "hasPendingMessages": false, "model": {...}, "thinkingLevel": "medium"}
{"type": "agent_start"}
{"type": "message_update", "message": {...}, "assistantMessageEvent": {...}}
{"type": "tool_execution_start", "toolCallId": "...", "toolName": "bash", "args": {...}}
{"type": "tool_execution_end", "toolCallId": "...", "result": {...}, "isError": false}
{"type": "turn_end", "message": {...}, "toolResults": [...]}
{"type": "agent_end", "messages": [...]}
{"type": "session_compact", "compactionEntry": {...}}
```

`hydrate` is sent once per WS connection (initial connect, and again after a reconnect following session replacement) so a phone joining mid-conversation sees full history, not just future deltas. `state` is sent whenever `ctx.isIdle()` / `ctx.hasPendingMessages()` / model / thinking level change — this is how the phone UI shows "queued, will send after current turn" instead of a message just silently vanishing. (Note: pi's `queue_update` RPC event isn't exposed as an extension hook today, so queue-depth is inferred from `ctx.hasPendingMessages()` rather than mirrored exactly; revisit if that proves insufficient.)

**Client → server**:

```json
{"type": "prompt", "message": "..."}
{"type": "abort"}
```

`server.ts` handles `prompt` by calling `pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: "steer" })` — steering by default when busy, since "answer a question it asked" implies you want your reply picked up promptly, not queued behind whatever else is running. `abort` calls `ctx.abort()`.

## Security

This is the section most worth your review — the threat model is genuinely different from `pi-repa-web`.

- **Must be LAN-reachable by design** (the couch/phone scenario is pointless on localhost-only), so default bind is **`0.0.0.0`**, default port e.g. `4390`. This is the opposite default of `pi-repa-web`'s localhost-only stance, and it's a deliberate trade-off, not an oversight — flag if you'd rather default to `127.0.0.1` and require an explicit flag/setting to open it up.
- **Mandatory bearer token**, always on, no opt-out. Generated on first use, persisted (mode `600`) in `~/.pi/agent/pi-web-viewer/config.json`, printed/notified in the TUI (`/web-viewer-url` command shows the full bookmarkable URL) so you can copy it to your phone once. `/web-viewer-rotate-token` invalidates it and disconnects existing clients.
- **No TLS.** Token travels as a query param over plain HTTP on your LAN. Acceptable for "phone on the same home Wi-Fi as the desktop," not acceptable over an untrusted network — call this out in the README rather than trying to reimplement TLS; Tailscale/WireGuard is the documented escape hatch if you want this reachable beyond the LAN.
- **Whatever tools the TUI session already has active** (bash/write/edit, by default) are exactly what a phone prompt can trigger — a reply from the couch has the same power as typing at the keyboard. This is inherent to "mirror the real session," not a separate permission surface to build.
- `--web-viewer=false` flag / `.pi/agent/pi-web-viewer/config.json` `"enabled": false` to opt out entirely for sessions where you don't want the port open at all (e.g. working on something sensitive on public wifi).

## Implementation steps

1. **Scaffolding** — `package.json` (`ws` dependency, `"pi": {"extensions": ["./src/index.ts"]}`), `tsconfig.json`.
2. **config.ts** — load-or-create `~/.pi/agent/pi-web-viewer/config.json` with `{ host, port, token, enabled }`; generate a random token (e.g. `crypto.randomBytes(24).toString("base64url")`) on first run.
3. **server.ts** — `node:http` server: serves static files from `web/`, handles `GET /ws` upgrade (reject if token query param doesn't match, before completing the upgrade), maintains a `Set<WebSocket>` of connected clients, exposes `broadcast(event)`.
4. **wire.ts** — `entriesToHydratePayload(entries: SessionEntry[])`; the live-event pass-through is close to identity, so this file mainly documents which extension events map to which wire types.
5. **state.ts** — small helper computing `{ isStreaming, hasPendingMessages, model, thinkingLevel }` from `ctx`, and a `diffAndBroadcastState(prev, next)` used after every relevant event.
6. **index.ts** — extension factory:
   - `session_start`: start server (if `enabled`), call `server.setSession(ctx.sessionManager)`, broadcast fresh `hydrate` to any already-connected clients.
   - `session_shutdown`: stop server.
   - subscribe to `agent_start/end`, `turn_start/end`, `message_start/update/end`, `tool_execution_start/update/end`, `session_compact`, `model_select`, `thinking_level_select` → `server.broadcast(...)`.
   - handle inbound `prompt`/`abort` WS messages via `pi.sendUserMessage()` / `ctx.abort()`.
7. **commands.ts** — `/web-viewer-url` (notify the bookmarkable URL), `/web-viewer-rotate-token`, `/web-viewer-stop`, `/web-viewer-start`; `pi.registerFlag("web-viewer", { type: "boolean", default: true })`.
8. **web/** — single HTML page: WS client with reconnect+backoff, renders hydrate + live messages as chat bubbles, tool-call chips (collapsed, expand for args/result — same "worth pretty-printing: bash output, edit's unified diff" scope as the sibling project), textarea + send, disabled/steer-hint while streaming, abort button.

## Manual verification (v1)

1. Load the extension (symlink into `~/.pi/agent/extensions/` or `pi -e ./src/index.ts`), start `pi` normally in a project.
2. Run `/web-viewer-url`, confirm it prints a LAN-reachable URL with token.
3. Open that URL on a phone on the same network; confirm the current transcript renders (hydration).
4. Type a prompt at the desktop keyboard; confirm it streams live to the phone.
5. Send a prompt from the phone while the agent is idle; confirm it's processed immediately and appears at the desktop.
6. Send a prompt from the phone while the agent is mid-turn; confirm the phone UI shows it as queued/steering rather than erroring, and it's picked up after the current tool calls finish.
7. Trigger a tool call and confirm it renders and resolves on the phone.
8. Run `/new` or `/resume` at the desktop; confirm the phone reconnects and rehydrates to the new session's transcript within a few seconds.
9. Run `/web-viewer-rotate-token`; confirm the old URL stops working and the new one (from `/web-viewer-url`) works.
10. Restart `pi` entirely; confirm the phone reconnects to the same bookmarked URL once the new process is up.

## Explicitly out of scope for v1 (future work)

- Session list/switch from the browser — the TUI stays the only place sessions are created or switched; this extension is a mirror, not a second control surface for session lifecycle.
- Push notifications when the agent asks a question and is waiting (e.g. web push, or shelling out to `ntfy.sh`/similar) — genuinely useful given "answer questions from the couch," but it's a separate feature (needs its own opt-in service/config) layered on top of this once the core mirror works. Worth a follow-up plan.
- TLS / access beyond the LAN.
- Multi-user auth (single shared token model only).
- QR code in the terminal for the URL (nice-to-have convenience for typing a token on a phone; small, can be added anytime via a `qrcode-terminal`-style dependency in `/web-viewer-url`).
- Markdown/diff rendering polish beyond "readable."
- Reusing `pi-repa-web`'s React components — plausible later since the wire protocol is close, not attempted in v1 given the no-bundler goal above.
