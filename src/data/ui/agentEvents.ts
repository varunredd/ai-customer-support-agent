export type AgentEventType =
  | "REQUEST_RECEIVED"
  | "TOOL_STARTED"
  | "TOOL_SUCCEEDED"
  | "TOOL_FAILED"
  | "TOOL_RETRY"
  | "POLICY_CHECK"
  | "DECISION"
  | "REFUND_EXECUTION";

export type AgentEventStatus = "RUNNING" | "SUCCESS" | "FAILED" | "WARNING";

export interface AgentEventView {
  id: string;
  type: AgentEventType;
  timestamp: string;
  title: string;
  status?: AgentEventStatus;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}
