import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { hasStaffApiAccess } from "@/security/admin-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const repository = new RefundPolicyRepository(getDatabase());
  repository.ensureDefault();
  return Response.json({ policies: repository.list() });
}

export async function POST(request: Request) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Admin control authorization is required." } }, { status: 401 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.version !== "string" || typeof body.refundWindowDays !== "number") {
      throw new Error("version and refundWindowDays are required.");
    }
    const policy = new RefundPolicyRepository(getDatabase()).createDraft({
      version: body.version,
      refundWindowDays: body.refundWindowDays,
    });
    return Response.json({ policy }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create policy draft.";
    const conflict = /UNIQUE constraint/i.test(message);
    return Response.json({ error: { code: conflict ? "POLICY_VERSION_EXISTS" : "INVALID_POLICY", message } }, { status: conflict ? 409 : 400 });
  }
}
