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
  const active = repository.getActiveOrNull();
  return Response.json({ policies: repository.list(), activePolicyId: active?.id ?? null });
}

export async function POST(request: Request) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Staff authorization is required." } }, { status: 401 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.version !== "string" || typeof body.refundWindowDays !== "number") {
      throw new Error("version and refundWindowDays are required.");
    }
    const policy = new RefundPolicyRepository(getDatabase()).createDraft({
      version: body.version,
      refundWindowDays: body.refundWindowDays,
      rules: parseRules(body),
      sourcePolicyId: typeof body.sourcePolicyId === "string" ? body.sourcePolicyId : undefined,
    });
    return Response.json({ policy }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create policy draft.";
    const conflict = /UNIQUE constraint/i.test(message);
    return Response.json({ error: { code: conflict ? "POLICY_VERSION_EXISTS" : "INVALID_POLICY", message } }, { status: conflict ? 409 : 400 });
  }
}
