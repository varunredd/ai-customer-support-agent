export class ToolArgumentError extends Error {
  readonly code = "INVALID_TOOL_ARGUMENTS";
  readonly retryable = false;
}

export class AgentToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function expectObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolArgumentError("Tool arguments must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new ToolArgumentError(`Unknown tool argument(s): ${unknown.join(", ")}.`);
  }
}

export function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolArgumentError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function expectPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ToolArgumentError(`${field} must be a positive integer.`);
  }
  return value;
}

export function expectEnum<const T extends readonly string[]>(value: unknown, field: string, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) {
    throw new ToolArgumentError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T[number];
}

export function expectIsoDate(value: unknown, field: string): string {
  const text = expectString(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ToolArgumentError(`${field} must be a valid ISO-8601 timestamp.`);
  }
  return date.toISOString();
}
