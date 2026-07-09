import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface ViewerState {
  type: "state";
  isStreaming: boolean;
  hasPendingMessages: boolean;
  model: { provider: string; id: string; name: string } | null;
  thinkingLevel: string | undefined;
}

export function computeState(pi: ExtensionAPI, ctx: ExtensionContext): ViewerState {
  return {
    type: "state",
    isStreaming: !ctx.isIdle(),
    hasPendingMessages: ctx.hasPendingMessages(),
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id, name: ctx.model.name } : null,
    thinkingLevel: pi.getThinkingLevel(),
  };
}

export function statesEqual(a: ViewerState | undefined, b: ViewerState): boolean {
  if (!a) return false;
  return (
    a.isStreaming === b.isStreaming &&
    a.hasPendingMessages === b.hasPendingMessages &&
    a.thinkingLevel === b.thinkingLevel &&
    a.model?.provider === b.model?.provider &&
    a.model?.id === b.model?.id
  );
}
