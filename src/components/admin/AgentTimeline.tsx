import React from "react";
import { CheckCircle2, XCircle, Wrench, Clock, PlayCircle } from "lucide-react";
import styles from "./AgentTimeline.module.css";
import { AgentEventView } from "../../data/ui/agentEvents";

interface AgentTimelineProps {
  events: AgentEventView[];
}

export function AgentTimeline({ events }: AgentTimelineProps) {
  return (
    <div className={styles.timelineContainer}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;

        let Icon = Clock;
        let iconClass = styles.iconNeutral;

        if (event.type === "REQUEST_RECEIVED") {
          Icon = PlayCircle;
          iconClass = styles.iconNeutral;
        } else if (event.type.startsWith("TOOL")) {
          Icon = Wrench;
          iconClass = event.status === "FAILED" ? styles.iconFailed : styles.iconNeutral;
        } else if (event.type === "POLICY_CHECK") {
          Icon = event.status === "FAILED" ? XCircle : CheckCircle2;
          iconClass = event.status === "FAILED" ? styles.iconFailed : styles.iconSuccess;
        } else if (event.type === "DECISION") {
          Icon = event.status === "FAILED" ? XCircle : CheckCircle2;
          iconClass = event.status === "FAILED" ? styles.iconFailed : styles.iconSuccess;
        }

        const formattedTime = new Date(event.timestamp).toLocaleTimeString([], { hour12: false });

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
              
              {event.metadata && (
                <div className={styles.metadata}>
                  {event.metadata.input ? (
                    <div className={styles.metadataItem}>
                      <span className={styles.metadataLabel}>Input:</span>
                      <pre className={styles.metadataCode}>{JSON.stringify(event.metadata.input, null, 2)}</pre>
                    </div>
                  ) : null}
                  {event.metadata.rules ? (
                    <div className={styles.rulesList}>
                      {(event.metadata.rules as any[]).map((rule: any) => (
                        <div key={rule.id} className={styles.ruleItem}>
                          <span className={styles.ruleName}>{rule.id} · {rule.name}</span>
                          <span className={`${styles.ruleStatus} ${rule.status === "PASS" ? styles.rulePass : styles.ruleFail}`}>
                            {rule.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {event.durationMs && (
                    <div className={styles.duration}>
                      Status: {event.status} · {event.durationMs}ms
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
