import assert from "node:assert/strict";
import test from "node:test";
import { executeWithRetry, OperationTimeoutError } from "@/services/agent/retry";

test("operation timeouts are retryable and abort the timed-out attempt", async () => {
  let attempts = 0;
  let retries = 0;

  await assert.rejects(
    () =>
      executeWithRetry(
        (signal) => {
          attempts += 1;
          return new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        },
        {
          maxAttempts: 2,
          timeoutMs: 5,
          isRetryable: (error) => error instanceof OperationTimeoutError,
          onRetry: () => {
            retries += 1;
          },
        },
      ),
    OperationTimeoutError,
  );

  assert.equal(attempts, 2);
  assert.equal(retries, 1);
});
