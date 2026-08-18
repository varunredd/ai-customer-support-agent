export const DEMO_SCENARIOS = {
  approve: {
    key: "approve",
    label: "Standard approval",
    customerId: "cus_001",
    orderId: "ord_demo_approve",
    demoFailure: false,
    expectedOutcome: "APPROVE · $89.00",
  },
  deny: {
    key: "deny",
    label: "Policy denial",
    customerId: "cus_002",
    orderId: "ord_demo_final_sale",
    demoFailure: false,
    expectedOutcome: "DENY · final-sale rule",
  },
  retry: {
    key: "retry",
    label: "Failure / retry",
    customerId: "cus_001",
    orderId: "ord_demo_approve",
    demoFailure: true,
    expectedOutcome: "Failure → retry → success",
  },
} as const;

export type DemoScenarioName = keyof typeof DEMO_SCENARIOS;

export function parseDemoScenario(value: string | null | undefined): DemoScenarioName | null {
  if (!value) return null;
  return value === "approve" || value === "deny" || value === "retry" ? value : null;
}
