import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { signIntegrationPayload } from "@/security/integration-signature";

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run integration:sign -- ./context.json");
const secret = process.env.BUSINESS_INTEGRATION_SECRET?.trim();
if (!secret || secret.length < 32) throw new Error("BUSINESS_INTEGRATION_SECRET must be configured with at least 32 characters.");
const rawBody = fs.readFileSync(path.resolve(file), "utf8");
JSON.parse(rawBody);
const timestamp = String(Date.now());
const eventId = `evt_${randomUUID()}`;
const signature = signIntegrationPayload({ secret, timestamp, eventId, rawBody });
console.log(JSON.stringify({
  headers: {
    "x-jobform-timestamp": timestamp,
    "x-jobform-event-id": eventId,
    "x-jobform-signature": `sha256=${signature}`,
    "x-jobform-source": "business-platform",
    "content-type": "application/json",
  },
  file: path.resolve(file),
}, null, 2));
