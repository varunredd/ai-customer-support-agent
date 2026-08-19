import { getDatabase } from "@/db/database";
import { hasControlAccess } from "@/security/admin-control";
import { drainNotificationOutbox } from "@/services/notifications/notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasControlAccess(request, "INTERNAL_JOB_TOKEN")) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Internal job authorization is required." } }, { status: 401 });
  }
  const result = await drainNotificationOutbox(getDatabase());
  return Response.json(result);
}
