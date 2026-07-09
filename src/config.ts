import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ViewerConfig {
  host: string;
  port: number;
  token: string;
  enabled: boolean;
}

const CONFIG_DIR = join(homedir(), ".pi", "agent", "pi-web-viewer");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULTS: Omit<ViewerConfig, "token"> = {
  host: "0.0.0.0",
  port: 4390,
  enabled: true,
};

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Load the persisted config, creating it with fresh defaults (including a new token) on first use. */
export function loadConfig(): ViewerConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ViewerConfig>;
    return {
      host: parsed.host ?? DEFAULTS.host,
      port: parsed.port ?? DEFAULTS.port,
      enabled: parsed.enabled ?? DEFAULTS.enabled,
      token: parsed.token && parsed.token.length > 0 ? parsed.token : generateToken(),
    };
  } catch {
    const cfg: ViewerConfig = { ...DEFAULTS, token: generateToken() };
    saveConfig(cfg);
    return cfg;
  }
}

export function saveConfig(cfg: ViewerConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
}

export function rotateToken(cfg: ViewerConfig): ViewerConfig {
  const next = { ...cfg, token: generateToken() };
  saveConfig(next);
  return next;
}

export function setEnabled(cfg: ViewerConfig, enabled: boolean): ViewerConfig {
  const next = { ...cfg, enabled };
  saveConfig(next);
  return next;
}
