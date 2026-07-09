// Manual smoke test: loads the extension into a real `pi --mode rpc` process, prompts
// it to run a bash command, and checks the tool_execution_start/update/end wire shapes
// the client (web/app.js) relies on for rendering tool chips.
// Requires an authenticated pi model to be configured. Run from the project root:
// node scripts/smoke-test/tool-call.mjs
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
let buf = "";
proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    buf = buf.slice(idx + 1);
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

const ws = new WebSocket(`ws://127.0.0.1:${cfg.port}/ws?token=${cfg.token}`);
await new Promise((resolve) => ws.on("open", resolve));
await new Promise((resolve) => ws.once("message", resolve)); // consume hydrate

const toolEvents = [];
ws.on("message", (d) => {
  const evt = JSON.parse(d.toString());
  if (evt.type.startsWith("tool_execution")) toolEvents.push(evt);
});
ws.send(
  JSON.stringify({
    type: "prompt",
    message: "Run `echo hi-from-bash` using the bash tool. Just run it, no other commentary needed.",
  }),
);

await sleep(12000);
console.log("tool_execution events:", toolEvents.length);
for (const e of toolEvents) {
  console.log(
    e.type,
    "toolName=" + e.toolName,
    "args=" + JSON.stringify(e.args),
    e.result ? "result=" + JSON.stringify(e.result).slice(0, 150) : "",
  );
}

ws.close();
proc.stdin.end();
await sleep(300);
proc.kill();
process.exit(0);
