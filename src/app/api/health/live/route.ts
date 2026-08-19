export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "jobform-ai-support-agent", timestamp: new Date().toISOString() });
}
