import { getDatabase } from "@/db/database";
import {
  catalogRuleTemplates,
  mergePolicyRulesWithCatalog,
  policyRulesNeedCatalogBackfill,
} from "@/domain/refunds/policy";
import type { RefundPolicyRule } from "@/domain/refunds/policy";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { requireStaffAuth, requireStaffPermission } from "@/security/staff-authorization";
import { nextDraftVersionLabel } from "@/services/policy/policy-lifecycle.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRules(body: Record<string, unknown>): RefundPolicyRule[] | undefined {
  if (body.rules === undefined) return undefined;
  if (!Array.isArray(body.rules)) throw new Error("rules must be an array.");
  return body.rules as RefundPolicyRule[];
}

function serializePolicies(repository: RefundPolicyRepository) {
  const policies = repository.list().map((policy) => {
    if (policy.status !== "ACTIVE" || !policyRulesNeedCatalogBackfill(policy.rules)) return policy;
    // Read-time merge only — do not mutate published ACTIVE rows from GET.
    return { ...policy, rules: mergePolicyRulesWithCatalog(policy.rules) };
  });
  const policy = policies.find((entry) => entry.status === "ACTIVE") ?? null;
  return { policy, policies };
}

export async function GET(request: Request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const repository = new RefundPolicyRepository(getDatabase());
  return Response.json(serializePolicies(repository), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = requireStaffPermission(request, "policy:edit");
  if (auth instanceof Response) return auth;
  try {
    const body = await request.json() as Record<string, unknown>;
    const repository = new RefundPolicyRepository(getDatabase());
    const existing = repository.list();
    const refundWindowDays = typeof body.refundWindowDays === "number"
      ? body.refundWindowDays
      : (repository.getActiveOrNull()?.refundWindowDays ?? 30);
    const sourcePolicyId = typeof body.sourcePolicyId === "string" ? body.sourcePolicyId : undefined;
    const version = typeof body.version === "string" && body.version.trim()
      ? body.version.trim()
      : nextDraftVersionLabel(existing.map((policy) => policy.version));
    const rules = parseRules(body) ?? (sourcePolicyId ? undefined : catalogRuleTemplates());

    const policy = repository.createDraft({
      version,
      refundWindowDays,
      rules,
      sourcePolicyId,
    });
    return Response.json({ ...serializePolicies(repository), policy }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create draft policy.";
    const conflict = /UNIQUE constraint/i.test(message) || /already exists/i.test(message);
    return Response.json(
      { error: { code: conflict ? "POLICY_EXISTS" : "INVALID_POLICY", message } },
      { status: conflict ? 409 : 400 },
    );
  }
}
