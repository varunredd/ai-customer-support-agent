import { getDatabase } from "@/db/database";
import { jsonError } from "@/lib/http";
import {
  getSupportSessionDetail,
  InvalidSupportContextError,
  SupportSessionNotFoundError,
} from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  try {
    return Response.json(await getSupportSessionDetail(getDatabase(), sessionId));
  } catch (error) {
    if (error instanceof SupportSessionNotFoundError) return jsonError(404, error.code, error.message);
    if (error instanceof InvalidSupportContextError) return jsonError(500, error.code, error.message);
    return jsonError(500, "SESSION_READ_FAILED", "Unable to load support session.");
  }
}
