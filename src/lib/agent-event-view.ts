import type { PersistedAgentEvent } from "@/domain/agent/types";
import type { AgentEventView } from "@/data/ui/agentEvents";

export function toAgentEventView(event: PersistedAgentEvent): AgentEventView {
  return {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    timestamp: event.createdAt,
    title: event.title,
    status: event.status,
    toolName: event.toolName,
    callId: event.callId,
    durationMs: event.durationMs,
    metadata: event.metadata,
  };
}
