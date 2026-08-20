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
    if (current.status !== "DRAFT") {
      throw new Error("Only draft policies can be edited. Create a new draft from the live policy.");
    }

    const policy = repository.updateDraft(policyId, {
      version: typeof body.version === "string" ? body.version : undefined,
      refundWindowDays: typeof body.refundWindowDays === "number" ? body.refundWindowDays : undefined,
      rules: parseRules(body),
    });
    return Response.json({ policy, policies: repository.list() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: {
        code: "POLICY_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Unable to update policy.",
      },
    }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ policyId: string }> }) {
  const auth = requireStaffPermission(request, "policy:edit");
  if (auth instanceof Response) return auth;
  try {
    const { policyId } = await context.params;
    const repository = new RefundPolicyRepository(getDatabase());
    repository.deletePolicy(policyId);
    return Response.json({ ok: true, policies: repository.list() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: {
        code: "POLICY_DELETE_FAILED",
        message: error instanceof Error ? error.message : "Unable to delete policy.",
      },
    }, { status: 400 });
  }
}
