import { createHash, timingSafeEqual } from "node:crypto";
import { readAdminSession } from "@/security/admin-session";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function hasControlAccess(request: Request, envName: "ADMIN_CONTROL_TOKEN" | "INTERNAL_JOB_TOKEN") {
  const expected = process.env[envName]?.trim();
  if (!expected || expected.length < 24) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return provided.length > 0 && timingSafeEqual(digest(provided), digest(expected));
}

export function hasStaffApiAccess(request: Request) {
  return hasControlAccess(request, "ADMIN_CONTROL_TOKEN") || Boolean(readAdminSession(request));
}
