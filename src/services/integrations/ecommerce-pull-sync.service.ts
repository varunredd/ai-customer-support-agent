import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/database";
import { operationalLog } from "@/lib/observability/system-logger";
import { parseBusinessContextSnapshot, syncBusinessContext } from "@/services/integrations/business-sync.service";
import { signIntegrationPayload } from "@/security/integration-signature";

export interface EcommercePullResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  syncedCustomers?: number;
  syncedOrders?: number;
}

function integrationSecret() {
  const secret = process.env.BUSINESS_INTEGRATION_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return secret;
}

function ecommerceBaseUrl() {
  const baseUrl = process.env.ECOMMERCE_BASE_URL?.trim().replace(/\/$/, "");
  return baseUrl || null;
}

export function isEcommercePullConfigured() {
  return Boolean(integrationSecret() && ecommerceBaseUrl());
}

export async function pullAllCustomersFromEcommerce(source: string): Promise<EcommercePullResult> {
  const secret = integrationSecret();
  const baseUrl = ecommerceBaseUrl();
  if (!secret || !baseUrl) {
    return { ok: false, skipped: true, reason: "ECOMMERCE_BASE_URL or BUSINESS_INTEGRATION_SECRET is not configured." };
  }

  const rawBody = JSON.stringify({ limit: 500 });
  const timestamp = String(Date.now());
  const eventId = `pull_all_${randomUUID()}`;
  const signature = signIntegrationPayload({ secret, timestamp, eventId, rawBody });

  const response = await fetch(`${baseUrl}/api/integrations/jobform/export-all`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-jobform-timestamp": timestamp,
      "x-jobform-event-id": eventId,
      "x-jobform-signature": `sha256=${signature}`,
      "x-jobform-source": "jobform-auto-pull",
    },
    body: rawBody,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`E-commerce bulk export failed (${response.status}): ${text}`);
  }

  const payload = await response.json() as { snapshots?: unknown[] };
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const db = getDatabase();
  let syncedCustomers = 0;
  let syncedOrders = 0;

  for (const snapshot of snapshots) {
    const parsed = parseBusinessContextSnapshot(snapshot);
    const result = syncBusinessContext(db, {
      source,
      eventId: `${eventId}_${syncedCustomers}`,
      rawBody: JSON.stringify(snapshot),
      snapshot: parsed,
    });
    syncedCustomers += 1;
    syncedOrders += result.ordersUpserted;
  }

  return { ok: true, syncedCustomers, syncedOrders };
}

export async function runEcommercePullSync(trigger: string) {
  const db = getDatabase();
  try {
    const result = await pullAllCustomersFromEcommerce(`ecommerce-auto-pull:${trigger}`);
    if (result.skipped) return result;
    operationalLog({
      severity: "INFO",
      source: "ecommerce-pull-sync",
      code: "ECOMMERCE_PULL_COMPLETED",
      message: `Pulled ${result.syncedCustomers ?? 0} customers and ${result.syncedOrders ?? 0} orders from the store.`,
      metadata: { trigger, syncedCustomers: result.syncedCustomers, syncedOrders: result.syncedOrders },
    }, db);
    return result;
  } catch (error) {
    operationalLog({
      severity: "ERROR",
      source: "ecommerce-pull-sync",
      code: "ECOMMERCE_PULL_FAILED",
      message: error instanceof Error ? error.message : "E-commerce pull failed.",
      metadata: { trigger },
    }, db);
    return { ok: false, reason: error instanceof Error ? error.message : "E-commerce pull failed." };
  }
}
