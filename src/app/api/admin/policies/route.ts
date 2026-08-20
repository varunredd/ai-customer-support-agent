import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { requireStaffAuth, requireStaffPermission } from "@/security/staff-authorization";
import { catalogRuleTemplates, mergePolicyRulesWithCatalog, policyRulesNeedCatalogBackfill } from "@/domain/refunds/policy";
import type { RefundPolicyRule } from "@/domain/refunds/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRules(body: Record<string, unknown>): RefundPolicyRule[] | undefined {
  if (body.rules === undefined) return undefined;
  if (!Array.isArray(body.rules)) throw new Error("rules must be an array.");
  return body.rules as RefundPolicyRule[];
}

function backfillPolicyRules(repository: RefundPolicyRepository) {
  const active = repository.getActiveOrNull();
  if (!active) return null;
  if (!policyRulesNeedCatalogBackfill(active.rules)) return active;
  return repository.updateActive({ rules: mergePolicyRulesWithCatalog(active.rules) });
}

export async function GET(request: Request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const repository = new RefundPolicyRepository(getDatabase());
  repository.activatePendingDraft();
  const active = backfillPolicyRules(repository);
  return Response.json({ policy: active });
}

export async function POST(request: Request) {
  const auth = requireStaffPermission(request, "policy:edit");
  if (auth instanceof Response) return auth;
  try {
    const body = await request.json() as Record<string, unknown>;
    const refundWindowDays = typeof body.refundWindowDays === "number" ? body.refundWindowDays : 30;
    const rules = parseRules(body) ?? catalogRuleTemplates();
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
