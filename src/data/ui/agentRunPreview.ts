import { AgentEventView } from "./agentEvents";

export interface AgentRunPreview {
  id: string;
  customerId: string;
  orderId: string;
  status: "COMPLETED" | "FAILED" | "IN_PROGRESS";
  startedAt: string;
  completedAt?: string;
  events: AgentEventView[];
}

export const agentRunsPreview: AgentRunPreview[] = [
  {
    id: "run_001",
    customerId: "cus_001", // Maya Patel
    orderId: "ord_demo_approve",
    status: "COMPLETED",
    startedAt: "2026-08-18T10:42:00Z",
    completedAt: "2026-08-18T10:42:03Z",
    events: [
      {
        id: "evt_1",
        type: "REQUEST_RECEIVED",
        timestamp: "2026-08-18T10:42:00Z",
        title: "Customer Support Request",
        status: "SUCCESS"
      },
      {
        id: "evt_2",
        type: "TOOL_STARTED",
        timestamp: "2026-08-18T10:42:01Z",
        title: "Agent selected tool: get_order",
        status: "RUNNING",
        metadata: { input: { orderId: "ord_demo_approve" } }
      },
      {
        id: "evt_3",
        type: "TOOL_SUCCEEDED",
        timestamp: "2026-08-18T10:42:02Z",
        title: "Tool get_order succeeded",
        status: "SUCCESS",
        durationMs: 84,
        metadata: { input: { orderId: "ord_demo_approve" } }
      },
      {
        id: "evt_4",
        type: "POLICY_CHECK",
        timestamp: "2026-08-18T10:42:02Z",
        title: "Refund policy evaluation",
        status: "SUCCESS",
        metadata: {
          rules: [
            { id: "RF-001", name: "Return window", status: "PASS" },
            { id: "RF-002", name: "Final sale", status: "PASS" }
          ]
        }
      },
      {
        id: "evt_5",
        type: "DECISION",
        timestamp: "2026-08-18T10:42:03Z",
        title: "Refund Approved",
        status: "SUCCESS"
      }
    ]
  },
  {
    id: "run_002",
    customerId: "cus_002", // Noah Williams
    orderId: "ord_demo_final_sale",
    status: "COMPLETED",
    startedAt: "2026-08-18T11:15:00Z",
    completedAt: "2026-08-18T11:15:02Z",
    events: [
      {
        id: "evt_2_1",
        type: "REQUEST_RECEIVED",
        timestamp: "2026-08-18T11:15:00Z",
        title: "Customer Support Request",
        status: "SUCCESS"
      },
      {
        id: "evt_2_2",
        type: "TOOL_SUCCEEDED",
        timestamp: "2026-08-18T11:15:01Z",
        title: "Tool get_order succeeded",
        status: "SUCCESS",
        durationMs: 65,
        metadata: { input: { orderId: "ord_demo_final_sale" } }
      },
      {
        id: "evt_2_3",
        type: "POLICY_CHECK",
        timestamp: "2026-08-18T11:15:02Z",
        title: "Refund policy evaluation",
        status: "FAILED",
        metadata: {
          rules: [
            { id: "RF-001", name: "Return window", status: "PASS" },
            { id: "RF-002", name: "Final sale", status: "FAIL" }
          ]
        }
      },
      {
        id: "evt_2_4",
        type: "DECISION",
        timestamp: "2026-08-18T11:15:02Z",
        title: "Refund Denied",
        status: "FAILED"
      }
    ]
  }
];
