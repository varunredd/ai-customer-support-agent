import { getDatabase } from "@/db/database";
import { asObject, jsonError } from "@/lib/http";
import { AuditLogRepository } from "@/repositories/audit-log.repository";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";
import { requireStaffPermission, resolveStaffActorUserId, resolveStaffTenantId } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "escalations:manage");
  if (auth instanceof Response) return auth;
  const db = getDatabase();
  const tenantId = resolveStaffTenantId(db, auth);
  const escalations = new SupportEscalationRepository(db, tenantId).listRecent(100);
  return Response.json({ escalations }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = requireStaffPermission(request, "escalations:manage");
  if (auth instanceof Response) return auth;
  try {
    const db = getDatabase();
    const tenantId = resolveStaffTenantId(db, auth);
    const actorUserId = resolveStaffActorUserId(auth);
    const body = asObject(await request.json());
    const escalationId = typeof body.escalationId === "string" ? body.escalationId.trim() : "";
    const action = body.action === "resolve" || body.action === "assign" ? body.action : null;
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const assignedUserId = typeof body.assignedUserId === "string" ? body.assignedUserId.trim() : null;
    if (!escalationId || !action) {
      return jsonError(400, "INVALID_REQUEST", "escalationId and action (resolve|assign) are required.");
    }

    const repo = new SupportEscalationRepository(db, tenantId);
    const escalation = action === "resolve"
      ? repo.resolve(escalationId, { resolvedByUserId: actorUserId, notes })
      : repo.assign(escalationId, { assignedUserId: assignedUserId || null, notes });

    new AuditLogRepository(db, tenantId).record({
      actorUserId,
      action: action === "resolve" ? "ESCALATION_RESOLVED" : "ESCALATION_ASSIGNED",
      resourceType: "support_escalation",
      resourceId: escalation.id,
      metadata: { runId: escalation.runId, assignedUserId: escalation.assignedUserId },
    });

    return Response.json({ escalation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(400, "ESCALATION_UPDATE_FAILED", error instanceof Error ? error.message : "Unable to update escalation.");
  }
}
