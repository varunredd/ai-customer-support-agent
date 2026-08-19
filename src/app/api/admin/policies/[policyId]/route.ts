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

export async function PATCH(request: Request, context: { params: Promise<{ policyId: string }> }) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Staff authorization is required." } }, { status: 401 });
  }
  try {
    const { policyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const policy = new RefundPolicyRepository(getDatabase()).updateDraft(policyId, {
      version: typeof body.version === "string" ? body.version : undefined,
      refundWindowDays: typeof body.refundWindowDays === "number" ? body.refundWindowDays : undefined,
      rules: parseRules(body),
    });
    return Response.json({ policy });
  } catch (error) {
    return Response.json({ error: { code: "POLICY_UPDATE_FAILED", message: error instanceof Error ? error.message : "Unable to update policy." } }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ policyId: string }> }) {
  if (!hasStaffApiAccess(_request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Staff authorization is required." } }, { status: 401 });
  }
  try {
    const { policyId } = await context.params;
    new RefundPolicyRepository(getDatabase()).deletePolicy(policyId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: { code: "POLICY_DELETE_FAILED", message: error instanceof Error ? error.message : "Unable to delete policy." } }, { status: 400 });
  }
}
