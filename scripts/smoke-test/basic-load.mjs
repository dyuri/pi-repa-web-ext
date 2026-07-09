// Manual smoke test: loads the extension into a real `pi --mode rpc` process and
// exercises /web-viewer-url + get_state over the RPC stdio protocol.
// Run from the project root: node scripts/smoke-test/basic-load.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const extPath = "/home/dyuri/egyeb/prog/vibe/pi/pi-repa-web-ext/src/index.ts";
const proc = spawn("pi", ["--mode", "rpc", "-e", extPath, "--no-session"], {
  cwd: "/home/dyuri/egyeb/prog/vibe/pi/pi-repa-web-ext",
  stdio: ["pipe", "pipe", "pipe"],
});

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
      console.log("EVENT:", JSON.stringify(evt).slice(0, 500));
    } catch {
      console.log("RAW:", line.slice(0, 300));
    }
  }
});

proc.stderr.on("data", (chunk) => {
  console.error("STDERR:", chunk.toString().slice(0, 500));
});

function send(cmd) {
  proc.stdin.write(`${JSON.stringify(cmd)}\n`);
}

await sleep(1500);
console.log("--- sending /web-viewer-url ---");
send({ id: "1", type: "prompt", message: "/web-viewer-url" });
await sleep(1000);

console.log("--- sending get_state ---");
send({ id: "2", type: "get_state" });
await sleep(1000);

console.log("--- shutting down ---");
proc.stdin.end();
await sleep(500);
proc.kill();
await sleep(300);
process.exit(0);
