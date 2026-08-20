import type { AppDatabase } from "@/db/database";
import { operationalLog } from "@/lib/observability/system-logger";
import { NotificationOutboxRepository, type NotificationRecord } from "@/repositories/notification-outbox.repository";
import { resolveEmailCredentials } from "@/services/integrations/tenant-integration.service";

export interface NotificationSender {
  send(notification: NotificationRecord): Promise<{ providerMessageId: string }>;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export class ResendNotificationSender implements NotificationSender {
  constructor(private readonly db: AppDatabase) {}

  async send(notification: NotificationRecord): Promise<{ providerMessageId: string }> {
    const email = resolveEmailCredentials(this.db);
    const apiKey = email.apiKey;
    const from = email.fromEmail;
    if (!apiKey || !from) throw new Error("RESEND_NOT_CONFIGURED");

    const payload = notification.payload;
    const amount = typeof payload.amountCents === "number" ? `$${(payload.amountCents / 100).toFixed(2)}` : "your refund";
    const orderId = htmlEscape(payload.orderId);
    const refundId = htmlEscape(payload.refundId);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": notification.eventKey,
      },
      body: JSON.stringify({
        from,
        to: [notification.recipient],
        subject: notification.subject,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
          <h2>Refund confirmed</h2>
          <p>Your refund of <strong>${htmlEscape(amount)}</strong> for order <strong>${orderId}</strong> has been processed.</p>
          <p>Refund reference: <code>${refundId}</code></p>
          <p>If you did not request this refund, contact support.</p>
        </div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.json().catch(() => null) as { id?: unknown; message?: unknown } | null;
    if (!response.ok || typeof body?.id !== "string") {
      throw new Error(typeof body?.message === "string" ? body.message : `Resend returned HTTP ${response.status}.`);
    }
    return { providerMessageId: body.id };
  }
}

export async function drainNotificationOutbox(
  db: AppDatabase,
  options: { limit?: number; sender?: NotificationSender } = {},
) {
  const repository = new NotificationOutboxRepository(db);
  const sender = options.sender ?? new ResendNotificationSender(db);
  const pending = repository.listDispatchable(new Date().toISOString(), options.limit ?? 25);
  let sent = 0;
  let failed = 0;

  for (const notification of pending) {
    try {
      const result = await sender.send(notification);
      repository.markSent(notification.id, result.providerMessageId);
      sent += 1;
      operationalLog({
        severity: "INFO",
        source: "notifications",
        code: "NOTIFICATION_SENT",
        message: "Customer notification sent.",
        metadata: { notificationId: notification.id, eventType: notification.eventType },
      }, db);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const dead = repository.markFailed(notification.id, message);
      failed += 1;
      operationalLog({
        severity: message === "RESEND_NOT_CONFIGURED" ? "WARN" : "ERROR",
        source: "notifications",
        code: dead
          ? "NOTIFICATION_DEAD"
          : message === "RESEND_NOT_CONFIGURED" ? "NOTIFICATION_PROVIDER_NOT_CONFIGURED" : "NOTIFICATION_SEND_FAILED",
        message: dead
          ? "Customer notification exhausted retries."
          : message === "RESEND_NOT_CONFIGURED" ? "Resend notification delivery is not configured." : "Customer notification delivery failed.",
        metadata: { notificationId: notification.id, eventType: notification.eventType },
      }, db);
    }
  }

  return { processed: pending.length, sent, failed };
}
