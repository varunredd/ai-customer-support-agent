export const INTEGRATION_PROVIDERS = ["commerce", "email", "webhook"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const OUTBOUND_WEBHOOK_EVENTS = [
  "refund.completed",
  "case.escalated",
  "approval.required",
  "agent.failed",
] as const;
export type OutboundWebhookEvent = (typeof OUTBOUND_WEBHOOK_EVENTS)[number];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

export function isOutboundWebhookEvent(value: string): value is OutboundWebhookEvent {
  return (OUTBOUND_WEBHOOK_EVENTS as readonly string[]).includes(value);
}
