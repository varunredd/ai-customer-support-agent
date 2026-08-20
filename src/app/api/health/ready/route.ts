import { getDatabase } from "@/db/database";
import { SCHEMA_VERSION } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  try {
    const db = getDatabase();
    db.prepare("SELECT 1 AS ok").get();
    const migration = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number };
    checks.database = { ok: migration.version === SCHEMA_VERSION, detail: `schema ${migration.version}/${SCHEMA_VERSION}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.database = {
      ok: false,
      detail: `database unavailable: ${message.slice(0, 240)}`,
    };
  }

  const requireOpenAI = process.env.NODE_ENV === "production" || process.env.HEALTH_REQUIRE_OPENAI === "true";
  checks.openaiConfiguration = { ok: !requireOpenAI || Boolean(process.env.OPENAI_API_KEY?.trim()), detail: requireOpenAI ? "required" : "optional" };
  const ok = Object.values(checks).every((check) => check.ok);
  return Response.json({ status: ok ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
