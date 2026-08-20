import type { CustomerPolicyCheck } from "@/domain/support/types";

const HIDDEN_CUSTOMER_CHECK_CODES = new Set(["RISK_NOT_HIGH"]);

export function customerPolicyChecksFromUnknown(value: unknown): CustomerPolicyCheck[] {
  if (!Array.isArray(value)) return [];
  const checks: CustomerPolicyCheck[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const summary = typeof record.summary === "string" ? record.summary.trim() : "";
    if (!code || !summary || HIDDEN_CUSTOMER_CHECK_CODES.has(code)) continue;
    checks.push({
      code: code.slice(0, 80),
      passed: record.passed === true,
      summary: summary.slice(0, 240),
    });
  }
  return checks;
}
