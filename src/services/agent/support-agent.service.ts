import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { PersistedAgentEvent, RunSupportAgentInput, RunSupportAgentResult } from "@/domain/agent/types";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { AgentModelError, isFunctionCall, type AgentModel, type AgentModelResponse } from "@/services/agent/model";
import { SUPPORT_AGENT_INSTRUCTIONS } from "@/services/agent/prompt";
import { executeWithRetry, OperationTimeoutError } from "@/services/agent/retry";
import { createRefundToolRegistry, type CreateRefundToolRegistryOptions } from "@/tools/agent/refund-tool-registry";
import type { ToolExecutionResult } from "@/tools/agent/types";
import { AgentToolError, ToolArgumentError } from "@/tools/agent/validation";

export interface SupportAgentOptions extends Pick<CreateRefundToolRegistryOptions, "failOnceTool"> {
  maxTurns?: number;
  toolMaxAttempts?: number;
  toolTimeoutMs?: number;
  modelMaxAttempts?: number;
  modelTimeoutMs?: number;
  onEvent?: (event: PersistedAgentEvent) => void | Promise<void>;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value };
  return value as Record<string, unknown>;
}

function errorCode(error: Error, fallback: string) {
  if (error instanceof OperationTimeoutError) return error.code;
  if (error instanceof AgentToolError || error instanceof AgentModelError) return error.code;
  if (error instanceof ToolArgumentError) return error.code;
  return fallback;
}

function toolErrorResult(error: Error): ToolExecutionResult {
  if (error instanceof AgentToolError) {
    return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable } };
  }
  if (error instanceof ToolArgumentError) {
    return { ok: false, error: { code: error.code, message: error.message, retryable: false } };
  }
  if (error instanceof OperationTimeoutError) {
    return { ok: false, error: { code: error.code, message: error.message, retryable: true } };
  }
  return {
    ok: false,
    error: { code: "TOOL_EXECUTION_ERROR", message: error.message, retryable: false },
  };
}

function isRetryableToolError(error: Error) {
  return error instanceof OperationTimeoutError || (error instanceof AgentToolError && error.retryable);
}

function isRetryableModelError(error: Error) {
  return error instanceof OperationTimeoutError || (error instanceof AgentModelError && error.retryable);
}

function buildUserInput(input: RunSupportAgentInput, requestedAt: string) {
  const contextLines = [
    input.customerEmail ? `Authenticated customer email: ${input.customerEmail}` : null,
    input.orderId ? `Active support order: ${input.orderId}` : null,
    `Request timestamp: ${requestedAt}`,
  ].filter((value): value is string => Boolean(value));
  return `${contextLines.join("\n")}\n\nCustomer message:\n${input.message}`;
}

async function maybeLogDeterministicEvents(
  appendEvent: (input: Parameters<AgentRunRepository["appendEvent"]>[0]) => Promise<PersistedAgentEvent>,
  runId: string,
  toolName: string,
  result: unknown,
) {
  if (toolName === "validate_refund_request" && result && typeof result === "object" && !Array.isArray(result)) {
    const evaluation = result as Record<string, unknown>;
    const checks = Array.isArray(evaluation.checks) ? evaluation.checks : [];
    await appendEvent({
      runId,
      type: "POLICY_CHECK",
      status: evaluation.decision === "APPROVE" ? "SUCCESS" : "FAILED",
      title: "Deterministic refund policy evaluated",
      metadata: { checks },
    });
    if (evaluation.decision === "APPROVE" || evaluation.decision === "DENY") {
      await appendEvent({
        runId,
        type: "DECISION",
        status: evaluation.decision === "APPROVE" ? "SUCCESS" : "FAILED",
        title: evaluation.decision === "APPROVE" ? "Refund eligible" : "Refund denied by policy",
        metadata: {
          decision: evaluation.decision,
          refundAmountCents: evaluation.refundAmountCents,
          denialReasons: evaluation.denialReasons,
        },
      });
    }
  }

  if (toolName === "execute_refund" && result && typeof result === "object" && !Array.isArray(result)) {
    const execution = result as Record<string, unknown>;
    await appendEvent({
      runId,
      type: "REFUND_EXECUTION",
      status: execution.status === "COMPLETED" ? "SUCCESS" : "FAILED",
      title: execution.status === "COMPLETED" ? "Refund execution completed" : "Refund execution blocked",
      metadata: {
        status: execution.status,
        idempotentReplay: execution.idempotentReplay,
        refund: execution.refund,
        evaluation: execution.evaluation,
      },
    });
  }
}

export async function runSupportAgent(
  db: AppDatabase,
  model: AgentModel,
  input: RunSupportAgentInput,
  options: SupportAgentOptions = {},
): Promise<RunSupportAgentResult> {
  const requestedAt = input.requestedAt ? new Date(input.requestedAt).toISOString() : new Date().toISOString();
  const maxTurns = options.maxTurns ?? positiveInteger(process.env.AGENT_MAX_TURNS, 10);
  const toolMaxAttempts = options.toolMaxAttempts ?? positiveInteger(process.env.AGENT_TOOL_MAX_ATTEMPTS, 3);
  const toolTimeoutMs = options.toolTimeoutMs ?? positiveInteger(process.env.AGENT_TOOL_TIMEOUT_MS, 5000);
  const modelMaxAttempts = options.modelMaxAttempts ?? 3;
  const modelTimeoutMs = options.modelTimeoutMs ?? 30000;
  const runRepository = new AgentRunRepository(db);
  const tools = createRefundToolRegistry(db, {
    failOnceTool: options.failOnceTool,
    authenticatedCustomerEmail: input.customerEmail,
    requestTimestamp: requestedAt,
  });
  const toolDefinitions = Array.from(tools.values(), (tool) => tool.definition);
  const userInput = buildUserInput(input, requestedAt);
  const runId = runRepository.create({
    id: input.runId ?? `run_${randomUUID()}`,
    model: model.model,
    inputText: userInput,
  });

  if (input.orderId) {
    runRepository.setContext(runId, { orderId: input.orderId });
  }

  const appendEvent = async (eventInput: Parameters<AgentRunRepository["appendEvent"]>[0]) => {
    const event = runRepository.appendEvent(eventInput);
    await options.onEvent?.(event);
    return event;
  };

  await appendEvent({
    runId,
    type: "REQUEST_RECEIVED",
    status: "SUCCESS",
    title: "Customer support request received",
    metadata: { customerEmail: input.customerEmail ?? null, requestedAt },
  });

  const conversationInput: unknown[] = [{ role: "user", content: userInput }];

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const modelStarted = Date.now();
      await appendEvent({
        runId,
        type: "MODEL_REQUEST",
        status: "RUNNING",
        title: `Model turn ${turn} started`,
      });

      let response: AgentModelResponse;
      try {
        response = await executeWithRetry(
          (signal) =>
            model.createResponse(
              { instructions: SUPPORT_AGENT_INSTRUCTIONS, input: conversationInput, tools: toolDefinitions },
              signal,
            ),
          {
            maxAttempts: modelMaxAttempts,
            timeoutMs: modelTimeoutMs,
            isRetryable: isRetryableModelError,
            onRetry: async ({ attempt, error, delayMs }) => {
              await appendEvent({
                runId,
                type: "MODEL_FAILED",
                status: "FAILED",
                title: `Model attempt ${attempt} failed`,
                metadata: { attempt, code: errorCode(error, "MODEL_ERROR"), message: error.message },
              });
              await appendEvent({
                runId,
                type: "MODEL_RETRY",
                status: "WARNING",
                title: "Retrying model request",
                metadata: { attempt, code: errorCode(error, "MODEL_ERROR"), delayMs },
              });
            },
          },
        );
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        await appendEvent({
          runId,
          type: "MODEL_FAILED",
          status: "FAILED",
          title: `Model turn ${turn} failed`,
          durationMs: Date.now() - modelStarted,
          metadata: { code: errorCode(normalized, "MODEL_ERROR"), message: normalized.message, finalAttempt: true },
        });
        throw normalized;
      }

      await appendEvent({
        runId,
        type: "MODEL_RESPONSE",
        status: "SUCCESS",
        title: `Model turn ${turn} completed`,
        durationMs: Date.now() - modelStarted,
        metadata: { responseId: response.id },
      });

      const functionCalls = response.output.filter(isFunctionCall);
      if (functionCalls.length === 0) {
        const finalText = response.outputText.trim();
        if (!finalText) {
          throw new AgentModelError("MODEL_EMPTY_RESPONSE", "Model returned neither tool calls nor customer-facing text.", false);
        }
        runRepository.complete(runId, finalText);
        await appendEvent({
          runId,
          type: "RUN_COMPLETED",
          status: "SUCCESS",
          title: "Agent run completed",
        });
        return { runId, status: "COMPLETED", responseText: finalText };
      }

      // Preserve all model output items for the Responses tool loop. They are replayed to
      // the model but are never persisted as hidden chain-of-thought or surfaced in the admin UI.
      conversationInput.push(...response.output);

      for (const toolCall of functionCalls) {
        const tool = tools.get(toolCall.name);
        const started = Date.now();
        let parsedArguments: unknown;

        try {
          parsedArguments = JSON.parse(toolCall.arguments);
        } catch {
          const result: ToolExecutionResult = {
            ok: false,
            error: {
              code: "MALFORMED_TOOL_ARGUMENTS",
              message: "The model returned invalid JSON tool arguments.",
              retryable: false,
            },
          };
          await appendEvent({
            runId,
            type: "TOOL_FAILED",
            status: "FAILED",
            title: `Tool ${toolCall.name} rejected malformed arguments`,
            toolName: toolCall.name,
            callId: toolCall.call_id,
            durationMs: Date.now() - started,
            metadata: { error: result.error },
          });
          conversationInput.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify(result),
          });
          continue;
        }

        await appendEvent({
          runId,
          type: "TOOL_STARTED",
          status: "RUNNING",
          title: `Tool ${toolCall.name} started`,
          toolName: toolCall.name,
          callId: toolCall.call_id,
          metadata: { input: safeMetadata(parsedArguments) },
        });

        let toolResult: ToolExecutionResult;
        if (!tool) {
          toolResult = {
            ok: false,
            error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${toolCall.name}.`, retryable: false },
          };
        } else {
          try {
            const result = await executeWithRetry(
              (signal) => tool.execute(parsedArguments, { runId, runRepository, signal }),
              {
                maxAttempts: toolMaxAttempts,
                timeoutMs: toolTimeoutMs,
                isRetryable: isRetryableToolError,
                onRetry: async ({ attempt, error, delayMs }) => {
                  await appendEvent({
                    runId,
                    type: "TOOL_FAILED",
                    status: "FAILED",
                    title: `Tool ${toolCall.name} attempt ${attempt} failed`,
                    toolName: toolCall.name,
                    callId: toolCall.call_id,
                    metadata: {
                      attempt,
                      code: errorCode(error, "TOOL_ERROR"),
                      message: error.message,
                    },
                  });
                  await appendEvent({
                    runId,
                    type: "TOOL_RETRY",
                    status: "WARNING",
                    title: `Retrying tool ${toolCall.name}`,
                    toolName: toolCall.name,
                    callId: toolCall.call_id,
                    metadata: {
                      attempt,
                      delayMs,
                      code: errorCode(error, "TOOL_ERROR"),
                    },
                  });
                },
              },
            );
            toolResult = { ok: true, result };
          } catch (error) {
            toolResult = toolErrorResult(error instanceof Error ? error : new Error(String(error)));
          }
        }

        await appendEvent({
          runId,
          type: toolResult.ok ? "TOOL_SUCCEEDED" : "TOOL_FAILED",
          status: toolResult.ok ? "SUCCESS" : "FAILED",
          title: toolResult.ok ? `Tool ${toolCall.name} succeeded` : `Tool ${toolCall.name} failed`,
          toolName: toolCall.name,
          callId: toolCall.call_id,
          durationMs: Date.now() - started,
          metadata: toolResult.ok ? { result: toolResult.result } : { error: toolResult.error },
        });

        if (toolResult.ok) {
          await maybeLogDeterministicEvents(appendEvent, runId, toolCall.name, toolResult.result);
        }

        conversationInput.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(toolResult),
        });
      }
    }

    throw new Error(`Agent exceeded the maximum of ${maxTurns} model turns.`);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const code = error instanceof AgentModelError ? error.code : "AGENT_RUN_FAILED";
    runRepository.fail(runId, code, normalized.message);
    await appendEvent({
      runId,
      type: "RUN_FAILED",
      status: "FAILED",
      title: "Agent run failed",
      metadata: { code, message: normalized.message },
    });
    throw normalized;
  }
}
