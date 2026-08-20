export type AgentRunStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type AgentEventStatus = "RUNNING" | "SUCCESS" | "FAILED" | "WARNING";

export type AgentEventType =
  | "REQUEST_RECEIVED"
  | "MODEL_REQUEST"
  | "MODEL_RESPONSE"
  | "MODEL_FAILED"
  | "MODEL_RETRY"
  | "TOOL_STARTED"
  | "TOOL_SUCCEEDED"
  | "TOOL_FAILED"
  | "TOOL_RETRY"
  | "POLICY_CHECK"
  | "DECISION"
  | "REFUND_EXECUTION"
  | "ESCALATION"
  | "RUN_COMPLETED"
  | "RUN_FAILED";

export interface PersistedAgentEvent {
  id: string;
  runId: string;
  sequence: number;
  type: AgentEventType;
  status: AgentEventStatus | null;
  title: string;
  toolName: string | null;
  callId: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PersistedAgentRun {
  id: string;
  status: AgentRunStatus;
  model: string;
  inputText: string;
  customerId: string | null;
  orderId: string | null;
  finalOutput: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  events?: PersistedAgentEvent[];
}

export interface AgentConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RunSupportAgentInput {
  message: string;
  customerEmail?: string;
  orderId?: string;
  requestedAt?: string;
  runId?: string;
  sessionId?: string;
  conversationHistory?: AgentConversationTurn[];
}

export interface RunSupportAgentResult {
  runId: string;
  status: "COMPLETED";
  responseText: string;
}
