import { networkInterfaces } from "node:os";

/**
 * Pick a LAN-reachable address to show the user. "0.0.0.0" isn't something a phone
 * can connect to, so when bound to all interfaces, show the first non-internal IPv4
 * address instead. Falls back to the configured host if nothing usable is found.
 */
export function displayHost(configuredHost: string): string {
  if (configuredHost !== "0.0.0.0") return configuredHost;

  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "localhost";
}
