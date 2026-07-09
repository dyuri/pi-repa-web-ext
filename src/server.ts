import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { parseClientMessage } from "./wire.ts";

export interface ViewerServerOptions {
  host: string;
  port: number;
  token: string;
  webDir: string;
  onPrompt: (message: string) => void;
  onAbort: () => void;
  /** Called for each newly connected client to build its initial hydration payload. */
  buildHydrate: () => unknown;
}

interface StaticAsset {
  file: string;
  contentType: string;
}

const STATIC_ASSETS: Record<string, StaticAsset> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
  "/app.css": { file: "app.css", contentType: "text/css; charset=utf-8" },
};

const MAX_LISTEN_ATTEMPTS = 5;
const LISTEN_RETRY_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenMatches(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class ViewerServer {
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly opts: ViewerServerOptions) {
    this.http = createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true });
    this.http.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  async start(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_LISTEN_ATTEMPTS; attempt++) {
      try {
        await this.listenOnce();
        return;
      } catch (err) {
        lastError = err;
        if (!(err instanceof Error) || !("code" in err) || err.code !== "EADDRINUSE") throw err;
        await sleep(LISTEN_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  private listenOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.http.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        this.http.off("error", onError);
        resolve();
      };
      this.http.once("error", onError);
      this.http.once("listening", onListening);
      this.http.listen(this.opts.port, this.opts.host);
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close(1001, "server shutting down");
    }
    this.clients.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) =>
      this.http.close((err) => (err ? reject(err) : resolve())),
    );
  }

  broadcast(event: unknown): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  private getToken(url: URL): string | null {
    return url.searchParams.get("token");
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // No token check here: these are static, secret-free assets (HTML/CSS/JS shell) referenced
    // by plain relative URLs, so the browser's own requests for them never carry ?token=. The
    // actual session data and prompt injection live behind the WS upgrade below, which does
    // check the token.
    const url = new URL(req.url ?? "/", "http://placeholder");
    const asset = STATIC_ASSETS[url.pathname];
    if (!asset) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    try {
      const body = await readFile(join(this.opts.webDir, asset.file));
      res.writeHead(200, { "content-type": asset.contentType });
      res.end(body);
    } catch {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Failed to read asset");
    }
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", "http://placeholder");
    if (url.pathname !== "/ws" || !tokenMatches(this.opts.token, this.getToken(url))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify(this.opts.buildHydrate()));

      ws.on("message", (data) => {
        const msg = parseClientMessage(data.toString());
        if (!msg) return;
        if (msg.type === "prompt") this.opts.onPrompt(msg.message);
        else if (msg.type === "abort") this.opts.onAbort();
      });

      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }
}
