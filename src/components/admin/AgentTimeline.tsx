import React from "react";
import { CheckCircle2, CircleAlert, Clock, PlayCircle, RotateCcw, Wrench, XCircle } from "lucide-react";
import styles from "./AgentTimeline.module.css";
import type { AgentEventView } from "@/data/ui/agentEvents";

interface AgentTimelineProps {
  events: AgentEventView[];
}

interface PolicyCheckView {
  code: string;
  passed: boolean;
  summary: string;
}

function readPolicyChecks(metadata: Record<string, unknown> | null | undefined): PolicyCheckView[] {
  const candidate = metadata?.checks;
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.code !== "string" || typeof record.passed !== "boolean") return [];
    return [{ code: record.code, passed: record.passed, summary: typeof record.summary === "string" ? record.summary : "" }];
  });
}

function metadataPayload(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  if ("input" in metadata) return { label: "Input", value: metadata.input };
  if ("error" in metadata) return { label: "Error", value: metadata.error };
  if ("result" in metadata) return { label: "Result", value: metadata.result };
  if ("decision" in metadata) return { label: "Decision", value: metadata };
  if ("refund" in metadata) return { label: "Execution", value: metadata };
  return null;
}

export function AgentTimeline({ events }: AgentTimelineProps) {
  return (
    <div className={styles.timelineContainer}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        let Icon = Clock;
        let iconClass = styles.iconNeutral;

        if (event.type === "REQUEST_RECEIVED") Icon = PlayCircle;
        if (event.type.startsWith("TOOL")) Icon = event.type === "TOOL_RETRY" ? RotateCcw : Wrench;
        if (event.type.includes("FAILED") || event.status === "FAILED") {
          Icon = XCircle;
          iconClass = styles.iconFailed;
        } else if (["POLICY_CHECK", "DECISION", "REFUND_EXECUTION", "RUN_COMPLETED"].includes(event.type)) {
          Icon = CheckCircle2;
          iconClass = styles.iconSuccess;
        } else if (event.status === "WARNING") {
          Icon = CircleAlert;
        }

        const formattedTime = new Date(event.timestamp).toLocaleTimeString([], { hour12: false });
        const checks = readPolicyChecks(event.metadata);
        const payload = metadataPayload(event.metadata);

        return (
          <div key={event.id} className={styles.eventRow}>
            <div className={styles.timelineLine}>
              <div className={`${styles.iconWrapper} ${iconClass}`}>
                <Icon size={16} />
              </div>
              {!isLast && <div className={styles.line} />}
            </div>

            <div className={styles.eventContent}>
              <div className={styles.eventHeader}>
                <span className={styles.time}>{formattedTime}</span>
                <span className={styles.title}>{event.title}</span>
              </div>

              {checks.length > 0 ? (
                <div className={styles.metadata}>
                  <div className={styles.rulesList}>
                    {checks.map((rule) => (
                      <div key={rule.code} className={styles.ruleItem} title={rule.summary}>
                        <span className={styles.ruleName}>{rule.code} · {rule.summary}</span>
                        <span className={`${styles.ruleStatus} ${rule.passed ? styles.rulePass : styles.ruleFail}`}>
                          {rule.passed ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : payload ? (
                <details className={styles.metadata}>
                  <summary className={styles.metadataLabel}>{payload.label}</summary>
                  <pre className={styles.metadataCode}>{JSON.stringify(payload.value, null, 2)}</pre>
                </details>
              ) : null}

              {event.durationMs != null ? (
                <div className={styles.duration}>
                  {event.status ?? "COMPLETED"} · {event.durationMs}ms
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
