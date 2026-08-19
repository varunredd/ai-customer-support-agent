const SENSITIVE_KEYS = /(authorization|api[-_]?key|token|secret|password|cookie|email|address|phone|content)/i;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactSensitive(entry, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEYS.test(key) ? "[REDACTED]" : redactSensitive(entry, depth + 1),
  ]));
}

export function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return redactSensitive(metadata) as Record<string, unknown>;
}
