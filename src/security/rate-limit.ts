import type { AppDatabase } from "@/db/database";

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Please wait before trying again.");
  }
}

export function consumeRateLimit(
  db: AppDatabase,
  input: { key: string; limit: number; windowMs: number; nowMs?: number },
) {
  const key = input.key.trim();
  if (!key || key.length > 240) throw new Error("Rate-limit key is invalid.");
  const limit = Math.max(1, Math.min(10_000, Math.trunc(input.limit)));
  const windowMs = Math.max(1_000, Math.min(86_400_000, Math.trunc(input.windowMs)));
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const tx = db.transaction(() => {
    const row = db.prepare(`SELECT window_started_at_ms, request_count
      FROM request_rate_limits WHERE bucket_key = ?`).get(key) as
      | { window_started_at_ms: number; request_count: number }
      | undefined;

    if (!row || nowMs - row.window_started_at_ms >= windowMs) {
      db.prepare(`INSERT INTO request_rate_limits (bucket_key, window_started_at_ms, request_count, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(bucket_key) DO UPDATE SET
          window_started_at_ms = excluded.window_started_at_ms,
          request_count = 1,
          updated_at = excluded.updated_at`)
        .run(key, nowMs, nowIso);
      return { remaining: limit - 1, resetAtMs: nowMs + windowMs };
    }

    if (row.request_count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((row.window_started_at_ms + windowMs - nowMs) / 1000));
      throw new RateLimitExceededError(retryAfterSeconds);
    }

    db.prepare(`UPDATE request_rate_limits
      SET request_count = request_count + 1, updated_at = ? WHERE bucket_key = ?`)
      .run(nowIso, key);
    return { remaining: limit - row.request_count - 1, resetAtMs: row.window_started_at_ms + windowMs };
  });

  return tx.immediate();
}
