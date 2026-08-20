import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { requireStaffPermission } from "@/security/staff-authorization";
import { validatePersistedPolicy } from "@/services/policy/policy-lifecycle.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ policyId: string }> }) {
  const auth = requireStaffPermission(request, "policy:edit");
  if (auth instanceof Response) return auth;
  try {
    const { policyId } = await context.params;
    const repository = new RefundPolicyRepository(getDatabase());
    const current = repository.findById(policyId);
    if (!current) {
      return Response.json({
        error: { code: "POLICY_NOT_FOUND", message: "Refund policy was not found." },
      }, { status: 404 });
    }
    const validation = validatePersistedPolicy(current);
    return Response.json({ validation, policy: current }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: {
        code: "POLICY_VALIDATE_FAILED",
        message: error instanceof Error ? error.message : "Unable to validate policy.",
      },
    }, { status: 400 });
  }
}
