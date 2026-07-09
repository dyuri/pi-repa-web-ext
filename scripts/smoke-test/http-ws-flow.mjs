// Manual smoke test: loads the extension into a real `pi --mode rpc` process, then
// exercises the HTTP static routes (with/without token), WS auth rejection, hydration
// on connect, and a live prompt round-trip against a real model.
// Requires an authenticated pi model to be configured. Run from the project root:
// node scripts/smoke-test/http-ws-flow.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";

const extPath = "/home/dyuri/egyeb/prog/vibe/pi/pi-repa-web-ext/src/index.ts";
const cfg = JSON.parse(readFileSync(`${process.env.HOME}/.pi/agent/pi-web-viewer/config.json`, "utf8"));

const proc = spawn("pi", ["--mode", "rpc", "-e", extPath, "--no-session"], {
  cwd: "/home/dyuri/egyeb/prog/vibe/pi/pi-repa-web-ext",
  stdio: ["pipe", "pipe", "pipe"],
});
proc.stderr.on("data", (c) => console.error("STDERR:", c.toString().slice(0, 300)));
let buf = "";
proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.type !== "extension_ui_request" || evt.method !== "setWidget") {
        console.log("PI-EVENT:", JSON.stringify(evt).slice(0, 300));
      }
    } catch {}
  }
});

for (let i = 0; i < 30; i++) {
  try {
    await fetch(`http://127.0.0.1:${cfg.port}/`);
    break;
  } catch {
    await sleep(500);
  }
}

console.log("\n=== HTTP: static page without token (expect 401) ===");
let res = await fetch(`http://127.0.0.1:${cfg.port}/`);
console.log(res.status, await res.text());

console.log("\n=== HTTP: static page with token (expect 200) ===");
res = await fetch(`http://127.0.0.1:${cfg.port}/?token=${cfg.token}`);
console.log(res.status, res.headers.get("content-type"), (await res.text()).slice(0, 60));

console.log("\n=== HTTP: app.js with token ===");
res = await fetch(`http://127.0.0.1:${cfg.port}/app.js?token=${cfg.token}`);
console.log(res.status, res.headers.get("content-type"));

console.log("\n=== WS: bad token (expect reject) ===");
const badWs = new WebSocket(`ws://127.0.0.1:${cfg.port}/ws?token=wrong`);
await new Promise((resolve) => {
  badWs.on("open", () => {
    console.log("UNEXPECTED: connected with bad token");
    resolve();
  });
  badWs.on("error", (e) => {
    console.log("expected error:", e.message);
    resolve();
  });
  badWs.on("close", (code) => {
    console.log("closed, code:", code);
    resolve();
  });
});

console.log("\n=== WS: good token, expect hydrate ===");
const ws = new WebSocket(`ws://127.0.0.1:${cfg.port}/ws?token=${cfg.token}`);
await new Promise((resolve) => ws.on("open", resolve));
const firstMsg = await new Promise((resolve) => ws.once("message", (d) => resolve(JSON.parse(d.toString()))));
console.log("hydrate type:", firstMsg.type, "entries:", firstMsg.entries.length, "state:", JSON.stringify(firstMsg.state));

console.log("\n=== WS: send prompt, watch for message_start/agent_start ===");
const seen = [];
ws.on("message", (d) => {
  const evt = JSON.parse(d.toString());
  seen.push(evt.type);
  console.log("WS-EVENT:", evt.type, evt.type === "message_update" ? (evt.assistantMessageEvent?.type ?? "") : "");
});
ws.send(JSON.stringify({ type: "prompt", message: "Say the single word: PONG" }));

await sleep(9000);
console.log("\nSeen event types:", [...new Set(seen)].join(", "));

ws.close();
proc.stdin.end();
await sleep(300);
proc.kill();
process.exit(0);
