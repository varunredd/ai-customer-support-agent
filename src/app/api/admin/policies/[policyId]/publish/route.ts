import { getDatabase } from "@/db/database";
import { AuditLogRepository } from "@/repositories/audit-log.repository";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { requireStaffPermission, resolveStaffActorUserId } from "@/security/staff-authorization";
import { validatePersistedPolicy } from "@/services/policy/policy-lifecycle.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ policyId: string }> }) {
  const auth = requireStaffPermission(request, "policy:publish");
  if (auth instanceof Response) return auth;
  try {
    const { policyId } = await context.params;
    const repository = new RefundPolicyRepository(getDatabase());
    const current = repository.findById(policyId);
    if (!current) throw new Error("Refund policy was not found.");
    if (current.status === "ARCHIVED") throw new Error("Archived policies cannot be published.");
    const validation = validatePersistedPolicy(current);
    if (!validation.ok) {
      return Response.json({
        error: {
          code: "POLICY_VALIDATION_FAILED",
          message: validation.errors.join(" "),
          validation,
        },
      }, { status: 400 });
    }
    const policy = repository.publish(policyId);
    new AuditLogRepository(getDatabase()).record({
      actorUserId: resolveStaffActorUserId(auth),
      action: "POLICY_PUBLISHED",
      resourceType: "refund_policy",
      resourceId: policy.id,
      metadata: { version: policy.version, status: policy.status },
    });
    return Response.json({
      policy,
      policies: repository.list(),
      validation,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: {
        code: "POLICY_PUBLISH_FAILED",
        message: error instanceof Error ? error.message : "Unable to publish policy.",
      },
    }, { status: 400 });
  }
}
