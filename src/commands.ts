import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { rotateToken, setEnabled, type ViewerConfig } from "./config.ts";
import { displayHost } from "./network.ts";

export interface CommandsDeps {
  getConfig: () => ViewerConfig;
  setConfig: (cfg: ViewerConfig) => void;
  isRunning: () => boolean;
  start: (ctx: ExtensionCommandContext) => Promise<void>;
  stop: () => Promise<void>;
  restart: (ctx: ExtensionCommandContext) => Promise<void>;
}

function urlFor(cfg: ViewerConfig): string {
  return `http://${displayHost(cfg.host)}:${cfg.port}/?token=${cfg.token}`;
}

export function registerCommands(pi: ExtensionAPI, deps: CommandsDeps): void {
  pi.registerCommand("web-viewer-url", {
    description: "Show the bookmarkable URL for the web viewer",
    handler: async (_args, ctx) => {
      if (!deps.isRunning()) {
        ctx.ui.notify("Web viewer is stopped. Run /web-viewer-start first.", "warning");
        return;
      }
      ctx.ui.notify(`Web viewer: ${urlFor(deps.getConfig())}`, "info");
    },
  });

  pi.registerCommand("web-viewer-rotate-token", {
    description: "Generate a new web viewer access token and disconnect existing clients",
    handler: async (_args, ctx) => {
      const next = rotateToken(deps.getConfig());
      deps.setConfig(next);
      if (deps.isRunning()) await deps.restart(ctx);
      ctx.ui.notify(`Token rotated. New URL: ${urlFor(next)}`, "info");
    },
  });

  pi.registerCommand("web-viewer-stop", {
    description: "Stop the web viewer server (persists across restarts until /web-viewer-start)",
    handler: async (_args, ctx) => {
      deps.setConfig(setEnabled(deps.getConfig(), false));
      await deps.stop();
      ctx.ui.notify("Web viewer stopped.", "info");
    },
  });

  pi.registerCommand("web-viewer-start", {
    description: "Start the web viewer server",
    handler: async (_args, ctx) => {
      deps.setConfig(setEnabled(deps.getConfig(), true));
      await deps.start(ctx);
      if (deps.isRunning()) ctx.ui.notify(`Web viewer started: ${urlFor(deps.getConfig())}`, "info");
    },
  });
}
