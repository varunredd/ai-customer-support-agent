import { getDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isInteger(parsed) ? parsed : 100;
  return Response.json({ refunds: new AdminReadRepository(getDatabase()).listRefunds(limit) });
}
