import type { AppDatabase } from "@/db/database";
import {
  isIntegrationProvider,
  isOutboundWebhookEvent,
  OUTBOUND_WEBHOOK_EVENTS,
  type IntegrationProvider,
  type OutboundWebhookEvent,
} from "@/domain/integrations/types";
import { OutboundWebhookRepository } from "@/repositories/outbound-webhook.repository";
import { TenantIntegrationRepository } from "@/repositories/tenant-integration.repository";
import { decryptSecret, encryptSecret, integrationEncryptionConfigured, SecretBoxError } from "@/security/secret-box";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

function stringConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventList(config: Record<string, unknown>): OutboundWebhookEvent[] {
  const raw = config.events;
  if (!Array.isArray(raw)) return [...OUTBOUND_WEBHOOK_EVENTS];
  return raw.filter((entry): entry is OutboundWebhookEvent => typeof entry === "string" && isOutboundWebhookEvent(entry));
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function decryptIfPresent(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

export class TenantIntegrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function resolveCommerceCredentials(db: AppDatabase, tenantId?: string) {
  const tenant = resolveTenantId(db, tenantId);
  const row = new TenantIntegrationRepository(db, tenant).findByProvider("commerce");
  const vaultUrl = stringConfig(row?.config ?? {}, "baseUrl");
  const vaultSecret = decryptIfPresent(row?.credentialsEncrypted ?? null);
  const envUrl = process.env.ECOMMERCE_BASE_URL?.trim().replace(/\/$/, "") || null;
  const envSecret = process.env.BUSINESS_INTEGRATION_SECRET?.trim() || null;
  const baseUrl = (vaultUrl ?? envUrl)?.replace(/\/$/, "") || null;
  const secret = (vaultSecret && vaultSecret.length >= 32 ? vaultSecret : null)
    ?? (envSecret && envSecret.length >= 32 ? envSecret : null);
  return {
    tenantId: tenant,
    baseUrl,
    secret,
    configured: Boolean(baseUrl && secret),
    source: vaultUrl || vaultSecret ? "vault" as const : baseUrl || secret ? "env" as const : "none" as const,
  };
}

export function resolveEmailCredentials(db: AppDatabase, tenantId?: string) {
  const tenant = resolveTenantId(db, tenantId);
  const row = new TenantIntegrationRepository(db, tenant).findByProvider("email");
  const vaultFrom = stringConfig(row?.config ?? {}, "fromEmail");
  const vaultKey = decryptIfPresent(row?.credentialsEncrypted ?? null);
  const envFrom = process.env.RESEND_FROM_EMAIL?.trim() || null;
  const envKey = process.env.RESEND_API_KEY?.trim() || null;
  const apiKey = vaultKey || envKey;
  const fromEmail = vaultFrom || envFrom;
  return {
    tenantId: tenant,
    apiKey,
    fromEmail,
    configured: Boolean(apiKey && fromEmail),
    deliveryMode: process.env.NOTIFICATION_DELIVERY_MODE?.trim() || "worker",
    source: vaultFrom || vaultKey ? "vault" as const : fromEmail || apiKey ? "env" as const : "none" as const,
  };
}

export function resolveWebhookCredentials(db: AppDatabase, tenantId?: string) {
  const tenant = resolveTenantId(db, tenantId);
  const row = new TenantIntegrationRepository(db, tenant).findByProvider("webhook");
  const url = stringConfig(row?.config ?? {}, "url");
  const secret = decryptIfPresent(row?.credentialsEncrypted ?? null);
  const events = eventList(row?.config ?? {});
  const enabled = row?.status !== "DISABLED";
  return {
    tenantId: tenant,
    url,
    secret: secret && secret.length >= 32 ? secret : null,
    events,
    configured: Boolean(enabled && url && secret && secret.length >= 32),
  };
}

export function getPublicIntegrationStatus(db: AppDatabase, tenantId?: string) {
  const tenant = resolveTenantId(db, tenantId);
  const commerce = resolveCommerceCredentials(db, tenant);
  const email = resolveEmailCredentials(db, tenant);
  const webhook = resolveWebhookCredentials(db, tenant);
  const lastEvent = db.prepare(`
    SELECT source, status, created_at FROM integration_events
    WHERE tenant_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tenant) as { source: string; status: string; created_at: string } | undefined;
  const deliveries = new OutboundWebhookRepository(db, tenant).listRecent(12);

  return {
    encryptionReady: integrationEncryptionConfigured(),
    commerce: {
      configured: commerce.configured,
      host: hostFromUrl(commerce.baseUrl),
      baseUrl: commerce.baseUrl,
      hasSecret: Boolean(commerce.secret),
      source: commerce.source,
      lastEventAt: lastEvent?.created_at ?? null,
      lastEventStatus: lastEvent?.status ?? null,
      lastEventSource: lastEvent?.source ?? null,
    },
    email: {
      configured: email.configured,
      fromEmail: email.fromEmail,
      hasSecret: Boolean(email.apiKey),
      deliveryMode: email.deliveryMode,
      source: email.source,
    },
    webhooks: {
      configured: webhook.configured,
      url: webhook.url,
      hasSecret: Boolean(webhook.secret),
      events: webhook.events,
      deliveries: deliveries.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        status: item.status,
        attempts: item.attempts,
        lastError: item.lastError,
        responseStatus: item.responseStatus,
        createdAt: item.createdAt,
        sentAt: item.sentAt,
      })),
    },
  };
}

export function saveTenantIntegration(
  db: AppDatabase,
  tenantId: string,
  input: { provider: string; config?: Record<string, unknown>; secret?: string | null; status?: "ACTIVE" | "DISABLED" },
) {
  if (!isIntegrationProvider(input.provider)) {
    throw new TenantIntegrationError("INTEGRATION_PROVIDER_INVALID", "Provider must be commerce, email, or webhook.");
  }
  if (!integrationEncryptionConfigured() && input.secret?.trim()) {
    throw new TenantIntegrationError("INTEGRATION_ENCRYPTION_MISSING", "INTEGRATION_ENCRYPTION_KEY is required to store credentials.");
  }

  const repo = new TenantIntegrationRepository(db, tenantId);
  const existing = repo.findByProvider(input.provider);
  const nextConfig = { ...(existing?.config ?? {}), ...(input.config ?? {}) };

  if (input.provider === "commerce") {
    const baseUrl = stringConfig(nextConfig, "baseUrl");
    if (baseUrl) {
      let parsed: URL;
      try {
        parsed = new URL(baseUrl);
      } catch {
        throw new TenantIntegrationError("INTEGRATION_URL_INVALID", "Commerce base URL must be a valid http(s) URL.");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new TenantIntegrationError("INTEGRATION_URL_INVALID", "Commerce base URL must be http or https.");
      }
      nextConfig.baseUrl = parsed.toString().replace(/\/$/, "");
    } else {
      delete nextConfig.baseUrl;
    }
  }

  if (input.provider === "email") {
    const fromEmail = stringConfig(nextConfig, "fromEmail");
    if (fromEmail && !fromEmail.includes("@")) {
      throw new TenantIntegrationError("INTEGRATION_EMAIL_INVALID", "From email must be a valid address.");
    }
    if (fromEmail) nextConfig.fromEmail = fromEmail;
    else delete nextConfig.fromEmail;
  }

  if (input.provider === "webhook") {
    const url = stringConfig(nextConfig, "url");
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new TenantIntegrationError("INTEGRATION_URL_INVALID", "Webhook URL must be a valid http(s) URL.");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new TenantIntegrationError("INTEGRATION_URL_INVALID", "Webhook URL must be http or https.");
      }
      nextConfig.url = parsed.toString();
    } else {
      delete nextConfig.url;
    }
    const events = eventList(nextConfig);
    nextConfig.events = events;
    if (nextConfig.url && events.length === 0) {
      throw new TenantIntegrationError("INTEGRATION_EVENTS_REQUIRED", "Select at least one webhook event.");
    }
  }

  let credentialsEncrypted: string | null | undefined;
  const secret = input.secret?.trim() ?? "";
  if (secret) {
    if (secret.length < 32) {
      throw new TenantIntegrationError("INTEGRATION_SECRET_WEAK", "Secrets must be at least 32 characters.");
    }
    try {
      credentialsEncrypted = encryptSecret(secret);
    } catch (error) {
      if (error instanceof SecretBoxError) {
        throw new TenantIntegrationError("INTEGRATION_ENCRYPTION_MISSING", error.message);
      }
      throw error;
    }
  }

  return repo.upsert({
    provider: input.provider,
    status: input.status,
    config: nextConfig,
    credentialsEncrypted,
  });
}

export type PublicIntegrationStatus = ReturnType<typeof getPublicIntegrationStatus>;
