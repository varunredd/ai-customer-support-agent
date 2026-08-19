import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { hasStaffApiAccess } from "@/security/admin-control";
import type { RefundPolicyRule } from "@/domain/refunds/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRules(body: Record<string, unknown>): RefundPolicyRule[] | undefined {
  if (body.rules === undefined) return undefined;
  if (!Array.isArray(body.rules)) throw new Error("rules must be an array.");
  return body.rules as RefundPolicyRule[];
}

export async function GET() {
  const repository = new RefundPolicyRepository(getDatabase());
  repository.activatePendingDraft();
  const active = repository.getActiveOrNull();
  return Response.json({ policy: active });
}

export async function POST(request: Request) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Staff authorization is required." } }, { status: 401 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const refundWindowDays = typeof body.refundWindowDays === "number" ? body.refundWindowDays : 30;
    const rules = parseRules(body) ?? undefined;
    const policy = new RefundPolicyRepository(getDatabase()).createActive({
      refundWindowDays,
      rules,
    });
    return Response.json({ policy }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create policy.";
    const conflict = /UNIQUE constraint/i.test(message) || /already exists/i.test(message);
    return Response.json({ error: { code: conflict ? "POLICY_EXISTS" : "INVALID_POLICY", message } }, { status: conflict ? 409 : 400 });
  }
}
