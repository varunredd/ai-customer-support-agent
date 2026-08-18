import { getDatabase } from "@/db/database";
import { asObject, jsonError, readNonEmptyString } from "@/lib/http";
import { createSupportSession, InvalidSupportContextError } from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = asObject(await request.json());
    const customerId = readNonEmptyString(body, "customerId", 128);
    const orderId = readNonEmptyString(body, "orderId", 128);
    const detail = await createSupportSession(getDatabase(), { customerId, orderId });
    return Response.json(detail, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidSupportContextError) {
      return jsonError(404, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "Invalid request.";
    return jsonError(400, "INVALID_REQUEST", message);
  }
}
