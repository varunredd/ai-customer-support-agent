import "./load-env";
import { randomUUID } from "node:crypto";
import { createSupportLaunchToken } from "@/security/support-access";

const customerId = process.argv[2]?.trim();
const orderId = process.argv[3]?.trim();
if (!customerId || !orderId) {
  throw new Error("Usage: npm run support:launch-token -- <customerId> <orderId>");
}

const token = createSupportLaunchToken({
  customerId,
  orderId,
  jti: `launch_${randomUUID()}`,
  expiresInSeconds: 300,
});
const baseUrl = (process.env.APP_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");

console.log("Secure support launch created (expires in 5 minutes; single use after exchange):");
console.log(`${baseUrl}/support#launch=${encodeURIComponent(token)}`);
