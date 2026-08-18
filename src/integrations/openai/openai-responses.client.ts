import {
  AgentModelError,
  type AgentModel,
  type AgentModelRequest,
  type AgentModelResponse,
} from "@/services/agent/model";

interface OpenAIResponsesClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function extractOutputText(output: unknown[]): string {
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "message" || !Array.isArray(record.content)) continue;
    for (const content of record.content) {
      if (!content || typeof content !== "object" || Array.isArray(content)) continue;
      const part = content as Record<string, unknown>;
      if (part.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export class OpenAIResponsesClient implements AgentModel {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIResponsesClientOptions = {}) {
    this.apiKey = options.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
    this.model = options.model?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1";
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.apiKey) {
      throw new AgentModelError(
        "OPENAI_API_KEY_MISSING",
        "OPENAI_API_KEY is required to run the live support agent.",
        false,
      );
    }
  }

  async createResponse(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          instructions: request.instructions,
          input: request.input,
          tools: request.tools,
          tool_choice: "auto",
          parallel_tool_calls: false,
          store: false,
        }),
        signal,
      });
    } catch (error) {
      throw new AgentModelError(
        "OPENAI_NETWORK_ERROR",
        error instanceof Error ? error.message : "OpenAI request failed before receiving a response.",
        true,
      );
    }

    const bodyText = await response.text();
    let body: unknown;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }

    if (!response.ok) {
      let message = `OpenAI Responses API returned HTTP ${response.status}.`;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const errorObject = (body as Record<string, unknown>).error;
        if (errorObject && typeof errorObject === "object" && !Array.isArray(errorObject)) {
          const apiMessage = (errorObject as Record<string, unknown>).message;
          if (typeof apiMessage === "string") message = apiMessage;
        }
      }
      throw new AgentModelError(`OPENAI_HTTP_${response.status}`, message, retryableStatus(response.status));
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AgentModelError("OPENAI_INVALID_RESPONSE", "OpenAI returned a non-object response.", false);
    }

    const record = body as Record<string, unknown>;
    if (typeof record.id !== "string" || !Array.isArray(record.output)) {
      throw new AgentModelError("OPENAI_INVALID_RESPONSE", "OpenAI response is missing id or output.", false);
    }

    return {
      id: record.id,
      output: record.output,
      outputText: typeof record.output_text === "string" ? record.output_text : extractOutputText(record.output),
    };
  }
}
