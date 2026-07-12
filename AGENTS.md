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

`web/vendor/marked.js` and `web/vendor/dompurify.js` are prebuilt UMD browser bundles, checked
into the repo and loaded via plain `<script>` tags in `index.html` (globals `marked`/`DOMPurify`,
no bundler involved). They're vendored from the `marked`/`dompurify` devDependencies via
`npm run vendor` — bump versions in `package.json`, `npm install`, then re-run that script rather
than hand-editing the vendored files.

## Wire protocol

`src/wire.ts` documents this, but the load-bearing decision: most server -> client event types
(`agent_start`, `message_update`, `tool_execution_end`, ...) are pi's own extension event payloads
forwarded close to verbatim — they already carry a `type` field matching pi's RPC-mode vocabulary
(`docs/rpc.md` in the pi package). Only `hydrate` (full transcript + state, sent once per WS
connection) and `state` (`isStreaming`/`hasPendingMessages`/model/thinking-level deltas) are
invented by this extension. Keep new event types consistent with pi's own vocabulary rather than
inventing parallel names, unless there's a specific reason to diverge.

Assistant message text is rendered as markdown (`marked` + `DOMPurify`, see above) via
`renderMarkdown()` in `app.js`, and set with `innerHTML` — sanitizing is load-bearing, not
optional, since agent output can echo untrusted content (fetched web pages, file contents) that
could otherwise carry a script tag into a page holding the bearer token. User/system messages stay
plain `textContent`.

`thinking` content items (`{ type: "thinking", thinking: string }`, per `docs/session-format.md`)
render as a collapsed `<details>` chip, same pattern as tool calls (`createThinkingChip()` in
`app.js`) — collapsed by default, markdown-rendered body. Shared typography lives on the
`.markdown-body` CSS class, used by both assistant bubbles and thinking-chip bodies; don't
reintroduce per-bubble duplicate rules if you touch that CSS.

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

`formatToolBody()` in `app.js` special-cases `toolName === "subagent"` (the example extension at
`pi/packages/coding-agent/examples/extensions/subagent`) to render its `result.details`
(`SubagentDetails`: per-delegated-agent `messages`, `usage`, `stopReason`, etc.) instead of just
the summary text in `result.content` — otherwise the chip only shows the final rollup text, none
of the sub-agent's own tool calls or per-task status the TUI's custom `renderResult()` shows. This
is a plain-text reimplementation of that TUI renderer's collapsed view, not a shared one — if that
extension's `SubagentDetails` shape changes, `formatSubagentBody()`/`formatSubagentSingleResult()`
need updating to match (there's no type-level link between the two, since the extension is
external to this repo).

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

## Commands (`src/commands.ts`)

`/web-viewer-url`, `/web-viewer-start`, and `/web-viewer-rotate-token` show the connect URL as a
scannable QR code (`renderQrTerminal()` in `src/qr.ts`, using `qrcode-generator` for encoding) so
you don't have to type the URL+token into a phone by hand. Two things worth knowing if you touch
this:

- It's rendered via `ctx.ui.notify()`, not `ctx.ui.setWidget()` — `setWidget` truncates to
  `InteractiveMode.MAX_WIDGET_LINES` (10 lines), which a QR code blows past immediately. `notify()`
  prints into the chat scrollback instead, which has no such cap.
- The QR uses explicit ANSI black/white (`\x1b[30;40m` / `\x1b[97;107m`) per half-block cell rather
  than the terminal's default fg/bg. This is deliberate: it makes the code's polarity (dark module
  = black pixel) correct regardless of the user's terminal theme, which is what makes it scannable
  camera-side instead of just decorative.

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
