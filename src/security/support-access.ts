import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppDatabase } from "@/db/database";

export type SupportEntry = "portal" | "host" | "all";

export function supportEntry(): SupportEntry {
  const configured = process.env.SUPPORT_ENTRY?.trim().toLowerCase();
  if (configured === "portal" || configured === "host" || configured === "all") return configured;
  return "all";
}

export function portalEntryEnabled() {
  return supportEntry() !== "host";
}

export function hostEntryEnabled() {
  return supportEntry() !== "portal";
}

export interface SupportLaunchClaims {
  customerId: string;
  orderId: string;
  exp: number;
  jti: string;
}

export class SupportAccessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token is invalid.");
  }
}

function secret() {
  const value = process.env.SUPPORT_LAUNCH_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new SupportAccessError("SUPPORT_LAUNCH_NOT_CONFIGURED", "Secure support launch is not configured.");
  }
  return value;
}

function signSegment(payloadSegment: string) {
  return createHmac("sha256", secret()).update(payloadSegment).digest();
}

function constantEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function validateClaims(value: unknown, nowSeconds: number): SupportLaunchClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token claims are invalid.");
  }
  const claims = value as Record<string, unknown>;
  if (
    typeof claims.customerId !== "string" || !claims.customerId.trim() || claims.customerId.length > 128 ||
    typeof claims.orderId !== "string" || !claims.orderId.trim() || claims.orderId.length > 128 ||
    typeof claims.jti !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(claims.jti) ||
    typeof claims.exp !== "number" || !Number.isInteger(claims.exp)
  ) {
    throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token claims are invalid.");
  }
  if (claims.exp <= nowSeconds) throw new SupportAccessError("SUPPORT_LAUNCH_EXPIRED", "Support launch token has expired.");
  if (claims.exp > nowSeconds + 15 * 60) {
    throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token expiry exceeds the maximum allowed lifetime.");
  }
  return {
    customerId: claims.customerId.trim(),
    orderId: claims.orderId.trim(),
    exp: claims.exp,
    jti: claims.jti,
  };
}

export function createSupportLaunchToken(input: Omit<SupportLaunchClaims, "exp"> & { expiresInSeconds?: number }) {
  const expiresInSeconds = Math.max(30, Math.min(15 * 60, Math.trunc(input.expiresInSeconds ?? 300)));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims = validateClaims({
    customerId: input.customerId,
    orderId: input.orderId,
    jti: input.jti,
    exp: nowSeconds + expiresInSeconds,
  }, nowSeconds);
  const payload = base64url(JSON.stringify(claims));
  const signature = base64url(signSegment(payload));
  return `${payload}.${signature}`;
}

export function verifySupportLaunchToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): SupportLaunchClaims {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token is invalid.");
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token is invalid.");
  }
  const expected = signSegment(payload);
  if (!constantEqual(provided, expected)) throw new SupportAccessError("INVALID_SUPPORT_LAUNCH_TOKEN", "Support launch token signature is invalid.");
  return validateClaims(decodeJson(payload), nowSeconds);
}

export function consumeSupportLaunch(db: AppDatabase, claims: SupportLaunchClaims) {
  try {
    db.prepare(`INSERT INTO support_launch_tokens (jti, customer_id, order_id, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run(claims.jti, claims.customerId, claims.orderId, new Date(claims.exp * 1000).toISOString(), new Date().toISOString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint/i.test(message)) {
      throw new SupportAccessError("SUPPORT_LAUNCH_ALREADY_USED", "Support launch token has already been used.");
    }
    throw error;
  }
}

export function createSessionAccessToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export function assertSupportSessionAccess(db: AppDatabase, sessionId: string, request: Request) {
  const row = db.prepare("SELECT access_token_hash FROM support_sessions WHERE id = ?").get(sessionId) as
    | { access_token_hash: string | null }
    | undefined;
  if (!row) throw new SupportAccessError("SUPPORT_SESSION_NOT_FOUND", "Support session was not found.");
  if (!row.access_token_hash) throw new SupportAccessError("SUPPORT_SESSION_ACCESS_DENIED", "Support session is not authorized.");
  const token = bearerToken(request);
  if (!token) throw new SupportAccessError("SUPPORT_SESSION_ACCESS_DENIED", "Support session authorization is required.");
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(row.access_token_hash, "hex");
  if (!constantEqual(actual, expected)) throw new SupportAccessError("SUPPORT_SESSION_ACCESS_DENIED", "Support session authorization failed.");
}
