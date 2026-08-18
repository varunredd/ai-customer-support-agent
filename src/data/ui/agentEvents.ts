import type { AgentEventStatus, AgentEventType } from "@/domain/agent/types";

export interface AgentEventView {
  id: string;
  sequence?: number;
  type: AgentEventType;
  timestamp: string;
  title: string;
  status?: AgentEventStatus | null;
  toolName?: string | null;
  callId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}
