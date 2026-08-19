import "./load-env";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { OpenAIResponsesClient } from "@/integrations/openai/openai-responses.client";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { runSupportAgent } from "@/services/agent/support-agent.service";

async function main() {
  const scenario = process.argv[2] ?? "approve";
  const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
  const db = createDatabase(filename);
  seedCatalog(db);
  const model = new OpenAIResponsesClient();

  const scenarios = {
    approve: {
      customerEmail: "maya@example.com",
      message: "Please refund order ord_8901. I changed my mind. The Studio Headphones are unopened and I want to return quantity 1.",
      failOnceTool: undefined,
    },
    deny: {
      customerEmail: "noah@example.com",
      message: "Please refund order ord_8902. I changed my mind. The Limited Edition Tee is unopened and I want to return quantity 1.",
      failOnceTool: undefined,
    },
    retry: {
      customerEmail: "maya@example.com",
      message: "Please refund order ord_8901. I changed my mind. The Studio Headphones are unopened and I want to return quantity 1.",
      failOnceTool: "lookup_order",
    },
  } as const;

  const selected = scenarios[scenario as keyof typeof scenarios];
  if (!selected) {
    console.error("Usage: npm run agent:replay -- approve|deny|retry");
    process.exitCode = 1;
    db.close();
    return;
  }

  try {
    const result = await runSupportAgent(
      db,
      model,
      {
        message: selected.message,
        customerEmail: selected.customerEmail,
        requestedAt: "2026-08-18T12:00:00Z",
      },
      { failOnceTool: selected.failOnceTool },
    );
    console.log("\nCustomer response:\n", result.responseText);
    const run = new AgentRunRepository(db).findById(result.runId);
    console.log("\nPersisted run:\n", JSON.stringify(run, null, 2));
  } finally {
    db.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
