import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { staffCredentialsConfigured } from "@/security/admin-session";

const failures: string[] = [];
const warnings: string[] = [];

function requireSecret(name: string, minLength: number) {
  const value = process.env[name]?.trim() ?? "";
  if (value.length < minLength) failures.push(`${name} must be configured with at least ${minLength} characters.`);
}

if (!process.env.OPENAI_API_KEY?.trim()) failures.push("OPENAI_API_KEY is required for live agent requests.");
requireSecret("BUSINESS_INTEGRATION_SECRET", 32);
requireSecret("ADMIN_CONTROL_TOKEN", 24);
requireSecret("INTERNAL_JOB_TOKEN", 24);
requireSecret("SUPPORT_LAUNCH_SECRET", 32);
requireSecret("ADMIN_SESSION_SECRET", 32);

if (!staffCredentialsConfigured()) {
  failures.push("ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) are required for staff sign-in.");
}

const entry = process.env.SUPPORT_ENTRY?.trim().toLowerCase() || "all";
if (!["portal", "host", "all"].includes(entry)) {
  failures.push("SUPPORT_ENTRY must be portal, host, or all.");
}

if ((process.env.NOTIFICATION_DELIVERY_MODE?.trim().toLowerCase() || "worker") !== "worker") {
  failures.push("NOTIFICATION_DELIVERY_MODE=worker is required so provider availability is decoupled from refund execution.");
}

const appBaseUrl = process.env.APP_BASE_URL?.trim() ?? "";
try {
  const parsed = new URL(appBaseUrl);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!local && parsed.protocol !== "https:") failures.push("APP_BASE_URL must use https:// for public support-launch URLs.");
} catch {
  failures.push("APP_BASE_URL must be configured as an absolute URL.");
}

const databasePath = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
if (databasePath === ":memory:") failures.push("DATABASE_PATH=:memory: is not valid for production.");
else {
  const parent = path.dirname(path.resolve(databasePath));
  try {
    fs.mkdirSync(parent, { recursive: true });
    fs.accessSync(parent, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    failures.push(`Database directory is not readable/writable: ${parent}`);
  }
}

const notificationsConfigured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
if (!notificationsConfigured) warnings.push("Resend is not configured; refund emails will remain in the durable notification outbox.");

if (warnings.length) {
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
}
if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production preflight passed.");
}
