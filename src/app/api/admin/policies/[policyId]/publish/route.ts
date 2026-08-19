import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { hasStaffApiAccess } from "@/security/admin-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ policyId: string }> }) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Admin control authorization is required." } }, { status: 401 });
  }
  try {
    const { policyId } = await context.params;
    const policy = new RefundPolicyRepository(getDatabase()).publish(policyId);
    return Response.json({ policy });
  } catch (error) {
    return Response.json({ error: { code: "POLICY_PUBLISH_FAILED", message: error instanceof Error ? error.message : "Unable to publish policy." } }, { status: 400 });
  }
}
