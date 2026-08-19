import { hostEntryEnabled, portalEntryEnabled } from "@/security/support-access";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    portal: portalEntryEnabled(),
    host: hostEntryEnabled(),
  }, { headers: { "Cache-Control": "no-store" } });
}
