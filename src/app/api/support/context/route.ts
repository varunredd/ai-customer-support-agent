import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonError(403, "SUPPORT_DIRECTORY_DISABLED", "Customer directories are not public. Look up support with the email and order ID on the account.");
}
