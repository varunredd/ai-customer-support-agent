import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readAdminSession, staffCredentialsConfigured } from "@/security/admin-session";

function constantSecretEqual(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function adminDenied(request: NextRequest, status: number, code: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code, message: "Admin access is not authorized." } }, { status });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

function hasGatewayAccess(request: NextRequest) {
  const expected = process.env.ADMIN_GATEWAY_TOKEN?.trim() ?? "";
  if (expected.length < 32) return false;
  const provided = request.headers.get("x-jobform-admin-gateway")?.trim() ?? "";
  return Boolean(provided) && constantSecretEqual(provided, expected);
}

function hasStaffSession(request: NextRequest) {
  return Boolean(readAdminSession(request));
}

function publicAdminPath(path: string) {
  return path === "/api/admin/login" || path === "/api/admin/logout";
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin") || (path.startsWith("/api/admin") && !publicAdminPath(path))) {
    if (hasGatewayAccess(request) || hasStaffSession(request)) return NextResponse.next();
    if (!staffCredentialsConfigured() && process.env.NODE_ENV !== "production") return NextResponse.next();
    return adminDenied(request, 401, "ADMIN_ACCESS_DENIED");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
