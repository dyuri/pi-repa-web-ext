import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { ViewerState } from "./state.ts";

/**
 * Wire messages sent server -> client. Most event types (agent_start, message_update,
 * tool_execution_end, ...) are forwarded close to verbatim from pi's extension event
 * payloads, since those already carry a `type` field matching pi's own RPC event
 * vocabulary (see packages/coding-agent/docs/rpc.md). This file only documents the two
 * envelope types this extension adds on top: hydration and state snapshots.
 */
export interface HydratePayload {
  type: "hydrate";
  entries: SessionEntry[];
  state: ViewerState;
}

export function buildHydrate(entries: SessionEntry[], state: ViewerState): HydratePayload {
  return { type: "hydrate", entries, state };
}

/** Client -> server messages. */
export type ClientMessage = { type: "prompt"; message: string } | { type: "abort" };

export function parseClientMessage(raw: string): ClientMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  if (obj.type === "prompt" && typeof obj.message === "string") {
    return { type: "prompt", message: obj.message };
  }
  if (obj.type === "abort") {
    return { type: "abort" };
  }
  return undefined;
}
