import { getDatabase } from "@/db/database";
import { getSupportBranding } from "@/services/support/support-branding.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getSupportBranding(getDatabase()), {
    headers: { "Cache-Control": "no-store" },
  });
}
