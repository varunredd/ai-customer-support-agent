import { getDatabase } from "@/db/database";
import { asObject, jsonError } from "@/lib/http";
import { RefundApprovalRepository } from "@/repositories/refund-approval.repository";
import { requireStaffPermission, resolveStaffTenantId } from "@/security/staff-authorization";
import { approveRefundApproval, rejectRefundApproval } from "@/services/refund-execution.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "refund:approve");
  if (auth instanceof Response) return auth;
  const db = getDatabase();
  const tenantId = resolveStaffTenantId(db, auth);
  const approvals = new RefundApprovalRepository(db, tenantId).listPending(100);
  return Response.json({ approvals }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = requireStaffPermission(request, "refund:approve");
  if (auth instanceof Response) return auth;
  try {
    const db = getDatabase();
    const tenantId = resolveStaffTenantId(db, auth);
    const body = asObject(await request.json());
    const approvalId = typeof body.approvalId === "string" ? body.approvalId.trim() : "";
    const decision = body.decision === "APPROVE" || body.decision === "REJECT" ? body.decision : null;
    const note = typeof body.note === "string" ? body.note : undefined;
    if (!approvalId || !decision) {
      return jsonError(400, "INVALID_REQUEST", "approvalId and decision (APPROVE|REJECT) are required.");
    }
    const actorUserId = auth.kind === "session" ? auth.session.userId : "usr_control_token";
    if (decision === "REJECT") {
      const approval = rejectRefundApproval(db, approvalId, actorUserId, note, tenantId);
      return Response.json({ approval }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = approveRefundApproval(db, approvalId, actorUserId, note, tenantId);
    const approval = new RefundApprovalRepository(db, tenantId).findById(approvalId);
    return Response.json({ approval, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(400, "APPROVAL_DECISION_FAILED", error instanceof Error ? error.message : "Unable to decide approval.");
  }
}
