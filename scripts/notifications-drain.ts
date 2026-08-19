import "./load-env";
import { getDatabase } from "@/db/database";
import { drainNotificationOutbox } from "@/services/notifications/notification.service";

const result = await drainNotificationOutbox(getDatabase(), { limit: 50 });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.failed > 0 ? 1 : 0;
