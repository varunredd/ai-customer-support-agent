export interface ParsedSseEvent {
  event: string;
  data: unknown;
}

function parseBlock(block: string): ParsedSseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) as unknown };
  } catch {
    return { event, data: raw };
  }
}

export async function readSseResponse(response: Response, onEvent: (event: ParsedSseEvent) => void | Promise<void>) {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { error?: { message?: unknown } }).error?.message
      : null;
    throw new Error(typeof message === "string" ? message : `Request failed with HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("Streaming response did not include a body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseBlock(block);
      if (parsed) await onEvent(parsed);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  const trailing = parseBlock(buffer.trim());
  if (trailing) await onEvent(trailing);
}
