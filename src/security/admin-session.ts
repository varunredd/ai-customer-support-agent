import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "jobform_admin";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export class AdminAuthenticationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_CONTROL_TOKEN?.trim() || "";
  if (value.length < 24) {
    throw new AdminAuthenticationError("ADMIN_SESSION_NOT_CONFIGURED", "Staff authentication is not configured.");
  }
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function constantEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function staffCredentialsConfigured() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  return email.includes("@") && password.length >= 12;
}

export function verifyStaffCredentials(email: string, password: string) {
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!staffCredentialsConfigured()) {
    throw new AdminAuthenticationError("ADMIN_SESSION_NOT_CONFIGURED", "Staff authentication is not configured.");
  }
  const emailOk = email.trim().toLowerCase() === expectedEmail;
  const passwordOk = constantEqual(digest(password), digest(expectedPassword));
  if (!emailOk || !passwordOk) {
    throw new AdminAuthenticationError("ADMIN_CREDENTIALS_INVALID", "Email or password is incorrect.");
  }
  return expectedEmail;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createAdminSessionToken(email: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = Buffer.from(JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: nowSeconds + SESSION_TTL_SECONDS,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  if (!constantEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown; exp?: unknown };
    if (typeof claims.email !== "string" || !claims.email.includes("@")) return null;
    if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
    const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
    if (expectedEmail && claims.email.trim().toLowerCase() !== expectedEmail) return null;
    return { email: claims.email.trim().toLowerCase(), exp: claims.exp };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function readAdminSession(request: Request) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  try {
    return verifyAdminSessionToken(token);
  } catch {
    return null;
  }
}

export function adminSessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearAdminSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
