# AGENTS.md

Guidance for coding agents working in this repo. See `README.md` for setup/running and
`plans/web-interface-extension.md` for the full design doc.

## What this is

A pi TUI **extension** (not a standalone server — see `pi-repa-web` in the sibling directory for
that pattern). It runs inside the actual `pi` process the user has open, mirrors that one session
to a browser over HTTP+WS, and lets replies from the browser get injected back via
`pi.sendUserMessage()`. There is exactly one session (whatever the TUI has open) — no multi-session
registry, unlike `pi-repa-web`.

## Imports: `.ts` extensions, not `.js`

Extensions are loaded by pi via [jiti](https://github.com/unjs/jiti), which resolves relative
imports with an explicit `.ts` extension (e.g. `import { loadConfig } from "./config.ts"`). This
is the **opposite** convention from `pi-repa-web/server`, which compiles with `tsc` and requires
`.js` extensions under `NodeNext`. Don't "fix" the extensions here to `.js` — that breaks runtime
loading even though it might look more normal. `tsconfig.json` sets
`allowImportingTsExtensions: true` specifically so `tsc --noEmit` accepts this.

## No build step, no bundler

Neither `src/` (loaded directly by jiti) nor `web/` (plain HTML/CSS/JS) has a build step. This was
a deliberate choice during planning, confirmed with the user, to keep the extension lightweight —
don't introduce Vite/React/esbuild/etc. for `web/` without checking first. If richer UI is ever
wanted, the wire protocol is close enough to `pi-repa-web`'s that porting its React components is
plausible (see the plan doc), but that's a bigger conversation, not a default.

## Wire protocol

`src/wire.ts` documents this, but the load-bearing decision: most server -> client event types
(`agent_start`, `message_update`, `tool_execution_end`, ...) are pi's own extension event payloads
forwarded close to verbatim — they already carry a `type` field matching pi's RPC-mode vocabulary
(`docs/rpc.md` in the pi package). Only `hydrate` (full transcript + state, sent once per WS
connection) and `state` (`isStreaming`/`hasPendingMessages`/model/thinking-level deltas) are
invented by this extension. Keep new event types consistent with pi's own vocabulary rather than
inventing parallel names, unless there's a specific reason to diverge.

Two shapes worth knowing before touching `web/app.js`:

- `message_start` / `message_end` only fire for `user`, `assistant`, and `toolResult` roles (per
  pi's extension docs) — not `bashExecution` or `custom`. Those two only show up during hydration
  (read directly from session entries, which do include them). Don't add live-event branches for
  them; they're dead code that will never fire.
- `tool_execution_end` has no `args` field (confirmed via `scripts/smoke-test/tool-call.mjs`).
  `finalizeToolChip()` in `app.js` relies on the chip already existing from
  `tool_execution_start` — don't assume `args` is populated on the end event.
- `ctx.isIdle()` is **stale inside the `agent_end` handler**: pi-agent-core's `finishRun()`
  (which flips `isStreaming` to `false`) runs only after all `agent_end` listeners resolve, so
  reading state synchronously there always reports "still streaming". `index.ts` defers that
  specific `refreshState()` call with `setImmediate()` to observe the settled value — without
  it, the browser's Abort/Steer buttons never reset after a response finishes. `turn_end` and
  `message_end` don't have this problem (isStreaming spans the whole agent run, not per-turn).

## Server (`src/server.ts`)

- **Token check happens before the WS upgrade completes**, in the `upgrade` handler, not after —
  a bad token never gets a live socket. Keep it that way; don't move auth into a post-connect
  handshake message.
- Static assets are served from a **hardcoded allowlist map** (`STATIC_ASSETS`), not by joining
  the request path onto `webDir`. This avoids path traversal by construction. If you add a new
  static asset, add it to the map — don't switch to dynamic path resolution.
- `ViewerServer.start()` retries on `EADDRINUSE` a few times before giving up. This isn't
  defensive-for-its-own-sake: the server is stopped in `session_shutdown` and restarted in the next
  `session_start` on every `/new`, `/resume`, `/fork`, and `/reload` (see "Session replacement" in
  the plan doc), and the OS can be briefly slow to release the old socket. Don't remove the retry.

## Config (`src/config.ts`)

Token is generated once and persisted to `~/.pi/agent/pi-web-viewer/config.json` (mode `600`), then
reused across restarts and session switches so the bookmarked URL keeps working. Don't regenerate
it on every `session_start` — `/web-viewer-rotate-token` is the only supported way to change it.

## Verifying changes

`npm run check` (`tsc --noEmit`) catches type errors but proves nothing about runtime behavior —
jiti's loading and pi's actual event payloads are the real contract. Verify against a real `pi`
process:

```bash
pi --mode rpc -e ./src/index.ts --no-session
```

then drive it over stdin/stdout JSONL (see `docs/rpc.md` in the pi package), or start from
`scripts/smoke-test/*.mjs`, which already do this end-to-end (HTTP auth, WS auth, hydration, a real
prompt round-trip, and a real tool call). These are kept intentionally — update them when the wire
protocol changes rather than leaving them to rot, and add new ones for new behavior (e.g.
`/web-viewer-rotate-token`, session-replacement restart) rather than only checking by hand.

For `web/` changes, a real browser check matters too — an actual phone/browser session hasn't been
exercised yet as of this writing, only the server side via the smoke-test scripts.

## Out of scope for v1

Session list/switch from the browser, push notifications, TLS, multi-user auth, a terminal QR
code, and reusing `pi-repa-web`'s React components are all explicitly deferred — see
`plans/web-interface-extension.md`. Don't add these speculatively; ask first if a task seems to
need one of them.
