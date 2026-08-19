import { createHmac, timingSafeEqual } from "node:crypto";

export class IntegrationAuthenticationError extends Error {
  readonly code = "INTEGRATION_AUTHENTICATION_FAILED";
}

function safeEqualHex(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signIntegrationPayload(input: {
  secret: string;
  timestamp: string;
  eventId: string;
  rawBody: string;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.eventId}.${input.rawBody}`)
    .digest("hex");
}

export function verifyIntegrationRequest(input: {
  secret: string | undefined;
  timestamp: string | null;
  eventId: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
  toleranceMs?: number;
}) {
  const secret = input.secret?.trim();
  if (!secret || secret.length < 32) throw new IntegrationAuthenticationError("Business integration secret is not configured securely.");
  if (!input.timestamp || !input.eventId || !input.signature) throw new IntegrationAuthenticationError("Signed integration headers are required.");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.eventId)) throw new IntegrationAuthenticationError("Integration event ID is invalid.");

  const timestampMs = Number(input.timestamp);
  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs = input.toleranceMs ?? 5 * 60_000;
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > toleranceMs) {
    throw new IntegrationAuthenticationError("Integration request timestamp is outside the allowed window.");
  }

  const provided = input.signature.startsWith("sha256=") ? input.signature.slice(7) : input.signature;
  const expected = signIntegrationPayload({
    secret,
    timestamp: input.timestamp,
    eventId: input.eventId,
    rawBody: input.rawBody,
  });
  if (!safeEqualHex(provided, expected)) throw new IntegrationAuthenticationError("Integration signature is invalid.");

  return { eventId: input.eventId, timestampMs };
}
