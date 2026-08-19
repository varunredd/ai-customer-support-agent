export function readNonEmptyString(record: Record<string, unknown>, key: string, maxLength = 4000): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${key} is too long.`);
  return trimmed;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return request.headers.get("x-real-ip")?.trim().slice(0, 128) || "unknown";
}
