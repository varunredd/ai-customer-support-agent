import "./load-env";
import { getDatabase } from "@/db/database";
import { drainOutboundWebhooks } from "@/services/integrations/outbound-webhook.service";
import { drainNotificationOutbox } from "@/services/notifications/notification.service";

const db = getDatabase();
const notifications = await drainNotificationOutbox(db, { limit: 50 });
const webhooks = await drainOutboundWebhooks(db, { limit: 50 });
console.log(JSON.stringify({ notifications, webhooks }, null, 2));
process.exitCode = notifications.failed + webhooks.failed > 0 ? 1 : 0;
