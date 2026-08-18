import type { AgentModel, AgentModelRequest, AgentModelResponse } from "@/services/agent/model";

export class ScriptedAgentModel implements AgentModel {
  readonly model = "scripted-test-model";
  private index = 0;

  constructor(private readonly responses: AgentModelResponse[]) {}

  async createResponse(_request: AgentModelRequest, _signal?: AbortSignal): Promise<AgentModelResponse> {
    const response = this.responses[this.index];
    if (!response) throw new Error("ScriptedAgentModel ran out of responses.");
    this.index += 1;
    return response;
  }
}

export function toolCall(id: string, name: string, args: unknown): AgentModelResponse {
  return {
    id: `response_${id}`,
    output: [
      {
        type: "function_call",
        call_id: `call_${id}`,
        name,
        arguments: typeof args === "string" ? args : JSON.stringify(args),
      },
    ],
    outputText: "",
  };
}

export function finalResponse(id: string, text: string): AgentModelResponse {
  return {
    id: `response_${id}`,
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
    outputText: text,
  };
}
