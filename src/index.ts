import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.ts";
import { loadConfig, type ViewerConfig } from "./config.ts";
import { displayHost } from "./network.ts";
import { ViewerServer } from "./server.ts";
import { computeState, statesEqual, type ViewerState } from "./state.ts";
import { buildHydrate } from "./wire.ts";

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "web");

export default function (pi: ExtensionAPI) {
  let cfg = loadConfig();
  let server: ViewerServer | undefined;
  let lastState: ViewerState | undefined;

  pi.registerFlag("web-viewer", {
    type: "boolean",
    default: cfg.enabled,
    description: "Enable the web viewer HTTP/WS server for this run",
  });

  function broadcast(event: unknown): void {
    server?.broadcast(event);
  }

  function refreshState(ctx: ExtensionContext): void {
    const next = computeState(pi, ctx);
    if (!statesEqual(lastState, next)) {
      lastState = next;
      broadcast(next);
    }
  }

  async function startServer(ctx: ExtensionContext): Promise<void> {
    if (server) return;
    const instance = new ViewerServer({
      host: cfg.host,
      port: cfg.port,
      token: cfg.token,
      webDir: WEB_DIR,
      onPrompt: (message) => {
        pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: "steer" });
      },
      onAbort: () => ctx.abort(),
      buildHydrate: () => buildHydrate(ctx.sessionManager.getBranch(), computeState(pi, ctx)),
    });

    try {
      await instance.start();
      server = instance;
      ctx.ui.setStatus("web-viewer", `web viewer: http://${displayHost(cfg.host)}:${cfg.port}`);
    } catch (err) {
      ctx.ui.notify(`Web viewer failed to start: ${(err as Error).message}`, "error");
    }
  }

  async function stopServer(): Promise<void> {
    if (!server) return;
    const instance = server;
    server = undefined;
    await instance.stop();
  }

  async function restartServer(ctx: ExtensionContext): Promise<void> {
    await stopServer();
    await startServer(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    lastState = undefined;
    if (pi.getFlag("web-viewer")) await startServer(ctx);
  });

  pi.on("session_shutdown", async () => {
    await stopServer();
  });

  pi.on("agent_start", (event, ctx) => {
    broadcast(event);
    refreshState(ctx);
  });
  pi.on("agent_end", (event, ctx) => {
    broadcast(event);
    // pi-agent-core flips isStreaming to false in finishRun(), which runs only after all
    // agent_end listeners (including this one) resolve. ctx.isIdle() here is still stale
    // (reports streaming), so defer to the next macrotask to observe the settled idle state
    // — otherwise the client never learns the run actually finished and Abort/Steer stick.
    setImmediate(() => refreshState(ctx));
  });
  pi.on("turn_start", (event) => broadcast(event));
  pi.on("turn_end", (event, ctx) => {
    broadcast(event);
    refreshState(ctx);
  });
  pi.on("message_start", (event) => broadcast(event));
  pi.on("message_update", (event) => broadcast(event));
  pi.on("message_end", (event, ctx) => {
    broadcast(event);
    refreshState(ctx);
  });
  pi.on("tool_execution_start", (event) => broadcast(event));
  pi.on("tool_execution_update", (event) => broadcast(event));
  pi.on("tool_execution_end", (event, ctx) => {
    broadcast(event);
    refreshState(ctx);
  });
  pi.on("session_compact", (event) => broadcast(event));
  pi.on("model_select", (event, ctx) => {
    broadcast(event);
    refreshState(ctx);
  });
  pi.on("thinking_level_select", (event, ctx) => {
    broadcast(event);
    refreshState(ctx);
  });

  registerCommands(pi, {
    getConfig: () => cfg,
    setConfig: (next: ViewerConfig) => {
      cfg = next;
    },
    isRunning: () => server !== undefined,
    start: startServer,
    stop: stopServer,
    restart: restartServer,
  });
}
