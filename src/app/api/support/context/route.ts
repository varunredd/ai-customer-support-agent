import { getDatabase } from "@/db/database";
import { jsonError } from "@/lib/http";
import {
  listSupportCustomers,
  listSupportOrdersForCustomer,
} from "@/services/support/support-context.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId")?.trim() || null;

  try {
    if (customerId) {
      const orders = await listSupportOrdersForCustomer(getDatabase(), customerId);
      return Response.json({ orders });
    }

    const customers = await listSupportCustomers(getDatabase());
    return Response.json({ customers });
  } catch {
    return jsonError(500, "SUPPORT_CONTEXT_READ_FAILED", "Unable to load support session options.");
  }
}
