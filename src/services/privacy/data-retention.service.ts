import type { AppDatabase } from "@/db/database";

function positiveDays(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cutoff(days: number, nowMs: number) {
  return new Date(nowMs - days * 86_400_000).toISOString();
}

export function applyDataRetention(db: AppDatabase, nowMs = Date.now()) {
  const supportDays = positiveDays(process.env.SUPPORT_CONTENT_RETENTION_DAYS, 30);
  const agentDays = positiveDays(process.env.AGENT_CONTENT_RETENTION_DAYS, 30);
  const operationalDays = positiveDays(process.env.OPERATIONAL_EVENT_RETENTION_DAYS, 30);
  const notificationDays = positiveDays(process.env.NOTIFICATION_RECORD_RETENTION_DAYS, 30);
  const supportCutoff = cutoff(supportDays, nowMs);
  const agentCutoff = cutoff(agentDays, nowMs);
  const operationalCutoff = cutoff(operationalDays, nowMs);
  const notificationCutoff = cutoff(notificationDays, nowMs);

  const tx = db.transaction(() => {
    const support = db.prepare(`UPDATE support_messages
      SET content = '[REDACTED_BY_RETENTION]'
      WHERE created_at < ? AND content <> '[REDACTED_BY_RETENTION]'`).run(supportCutoff);

    const runs = db.prepare(`UPDATE agent_runs
      SET input_text = '[REDACTED_BY_RETENTION]',
          final_output = CASE WHEN final_output IS NULL THEN NULL ELSE '[REDACTED_BY_RETENTION]' END
      WHERE started_at < ? AND input_text <> '[REDACTED_BY_RETENTION]'`).run(agentCutoff);

    const operational = db.prepare("DELETE FROM operational_events WHERE created_at < ?").run(operationalCutoff);
    const notifications = db.prepare(`DELETE FROM notification_outbox
      WHERE status IN ('SENT', 'DEAD') AND updated_at < ?`).run(notificationCutoff);
    const launches = db.prepare("DELETE FROM support_launch_tokens WHERE expires_at < ?").run(new Date(nowMs).toISOString());
    const rateLimits = db.prepare("DELETE FROM request_rate_limits WHERE updated_at < ?").run(cutoff(1, nowMs));

    return {
      supportMessagesRedacted: support.changes,
      agentRunsRedacted: runs.changes,
      operationalEventsDeleted: operational.changes,
      notificationRecordsDeleted: notifications.changes,
      expiredSupportLaunchesDeleted: launches.changes,
      expiredRateLimitBucketsDeleted: rateLimits.changes,
      policy: { supportDays, agentDays, operationalDays, notificationDays },
    };
  });

  return tx.immediate();
}
