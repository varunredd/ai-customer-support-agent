import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResponsesClient } from "@/integrations/openai/openai-responses.client";

test("OpenAI Responses client sends a non-stored, serial tool-calling request", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        id: "resp_test",
        output: [
          {
            type: "function_call",
            call_id: "call_test",
            name: "get_refund_policy",
            arguments: "{}",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const client = new OpenAIResponsesClient({ apiKey: "test-key", fetchImpl: fakeFetch });
  const response = await client.createResponse({
    instructions: "test",
    input: [{ role: "user", content: "hello" }],
    tools: [
      {
        type: "function",
        name: "get_refund_policy",
        description: "test",
        strict: true,
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
    ],
  });

  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.method, "POST");
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(body.model, "gpt-4o-mini");
  assert.equal(body.store, false);
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(response.id, "resp_test");
  assert.equal(response.outputText, "");
});
