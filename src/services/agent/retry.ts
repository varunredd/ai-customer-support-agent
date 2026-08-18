export interface RetryOptions {
  maxAttempts: number;
  timeoutMs: number;
  onRetry?: (input: { attempt: number; error: Error; delayMs: number }) => void | Promise<void>;
  isRetryable: (error: Error) => boolean;
}

export class OperationTimeoutError extends Error {
  readonly code = "OPERATION_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms.`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  if (timeoutMs <= 0) return operation(controller.signal);

  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new OperationTimeoutError(timeoutMs));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function executeWithRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(operation, options.timeoutMs);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastError = normalized;
      if (attempt >= maxAttempts || !options.isRetryable(normalized)) throw normalized;
      const delayMs = Math.min(1000, 100 * 2 ** (attempt - 1));
      await options.onRetry?.({ attempt, error: normalized, delayMs });
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Retry loop exited unexpectedly.");
}
