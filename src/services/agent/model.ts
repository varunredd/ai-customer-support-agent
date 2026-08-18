import type { FunctionToolDefinition } from "@/tools/agent/types";

export interface ModelFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export interface AgentModelResponse {
  id: string;
  output: unknown[];
  outputText: string;
}

export interface AgentModelRequest {
  instructions: string;
  input: unknown[];
  tools: FunctionToolDefinition[];
}

export interface AgentModel {
  readonly model: string;
  createResponse(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse>;
}

export class AgentModelError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function isFunctionCall(value: unknown): value is ModelFunctionCall {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    item.type === "function_call" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}
