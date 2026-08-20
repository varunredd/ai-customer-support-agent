import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { requireStaffPermission } from "@/security/staff-authorization";
import type { RefundPolicyRule } from "@/domain/refunds/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRules(body: Record<string, unknown>): RefundPolicyRule[] | undefined {
  if (body.rules === undefined) return undefined;
  if (!Array.isArray(body.rules)) throw new Error("rules must be an array.");
  return body.rules as RefundPolicyRule[];
}

export async function PATCH(request: Request, context: { params: Promise<{ policyId: string }> }) {
  const auth = requireStaffPermission(request, "policy:edit");
  if (auth instanceof Response) return auth;
  try {
    const { policyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const repository = new RefundPolicyRepository(getDatabase());
    const current = repository.findById(policyId);
    if (!current) throw new Error("Refund policy was not found.");
    if (current.status === "ARCHIVED") throw new Error("Archived policies cannot be edited.");

    const patch = {
      version: typeof body.version === "string" ? body.version : undefined,
      refundWindowDays: typeof body.refundWindowDays === "number" ? body.refundWindowDays : undefined,
      rules: parseRules(body),
    };

    const policy = current.status === "ACTIVE"
      ? repository.updateActive(patch)
      : repository.updateDraft(policyId, patch);
    return Response.json({ policy });
  } catch (error) {
    return Response.json({ error: { code: "POLICY_UPDATE_FAILED", message: error instanceof Error ? error.message : "Unable to update policy." } }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ policyId: string }> }) {
  const auth = requireStaffPermission(request, "policy:edit");
  if (auth instanceof Response) return auth;
  try {
    const { policyId } = await context.params;
    new RefundPolicyRepository(getDatabase()).deletePolicy(policyId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: { code: "POLICY_DELETE_FAILED", message: error instanceof Error ? error.message : "Unable to delete policy." } }, { status: 400 });
  }
}
