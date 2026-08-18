import type { AgentRunRepository } from "@/repositories/agent-run.repository";

export interface FunctionToolDefinition {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

export interface AgentToolContext {
  runId: string;
  runRepository: AgentRunRepository;
  signal: AbortSignal;
}

export interface AgentTool {
  definition: FunctionToolDefinition;
  execute(args: unknown, context: AgentToolContext): Promise<unknown>;
}

export interface ToolExecutionResult {
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
