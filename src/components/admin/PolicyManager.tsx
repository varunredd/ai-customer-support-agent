"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import {
  DEFAULT_CONDITION_ALLOWED,
  ITEM_CONDITIONS,
  POLICY_RULE_TEMPLATE,
  REFUND_REASONS,
  type RefundPolicyRule,
  type RefundPolicyRuleCode,
} from "@/domain/refunds/policy";
import { StatusBadge } from "@/components/ui/StatusBadge";
import styles from "@/app/(admin)/admin/policy/page.module.css";

interface PolicyRecord {
  id: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  refundWindowDays: number;
  rules: RefundPolicyRule[];
  createdAt: string;
  publishedAt: string | null;
}

interface PolicyManagerProps {
  initialPolicy: PolicyRecord | null;
}

const RULE_LABELS: Record<RefundPolicyRuleCode, string> = {
  ACCOUNT_ACTIVE: "Account must be active",
  RISK_NOT_HIGH: "Block high-risk accounts",
  ORDER_OWNERSHIP: "Customer must own the order",
  ORDER_DELIVERED: "Order must be delivered",
  WITHIN_WINDOW: "Within return window",
  ITEM_REFUNDABLE: "Item must be refundable",
  NOT_FINAL_SALE: "No final-sale items",
  VALID_QUANTITY: "Valid refund quantity",
  CONDITION_ALLOWED: "Item condition rules",
  REMAINING_BALANCE: "No over-refunding",
};

function conditionConfig(rule: RefundPolicyRule) {
  const configured = rule.config?.allowedConditionsByReason;
  if (configured && typeof configured === "object" && !Array.isArray(configured)) {
    return { ...DEFAULT_CONDITION_ALLOWED, ...(configured as Record<string, string[]>) };
  }
  return { ...DEFAULT_CONDITION_ALLOWED };
}

function cloneRules(rules: RefundPolicyRule[]) {
  return rules.map((rule) => ({
    ...rule,
    config: rule.config ? JSON.parse(JSON.stringify(rule.config)) as Record<string, unknown> : undefined,
  }));
}

export function PolicyManager({ initialPolicy }: PolicyManagerProps) {
  const [policy, setPolicy] = useState<PolicyRecord | null>(initialPolicy);
  const [rules, setRules] = useState<RefundPolicyRule[]>(() => cloneRules(initialPolicy?.rules ?? []));
  const [refundWindow, setRefundWindow] = useState(initialPolicy?.refundWindowDays ?? 30);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const availableRuleCodes = useMemo(() => {
    const used = new Set(rules.map((rule) => rule.code));
    return POLICY_RULE_TEMPLATE.map((rule) => rule.code).filter((code) => !used.has(code));
  }, [rules]);

  const enabledCount = rules.filter((rule) => rule.enabled).length;

  async function refreshPolicy() {
    const response = await fetch("/api/admin/policies", { cache: "no-store" });
    const payload = await response.json() as { policy: PolicyRecord | null };
    setPolicy(payload.policy);
    if (payload.policy) {
      setRules(cloneRules(payload.policy.rules));
      setRefundWindow(payload.policy.refundWindowDays);
    }
  }

  async function createPolicy(starter: "recommended" | "blank") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundWindowDays: 30, starter }),
      });
      const payload = await response.json() as { policy?: PolicyRecord; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to create policy.");
      setPolicy(payload.policy ?? null);
      if (payload.policy) {
        setRules(cloneRules(payload.policy.rules));
        setRefundWindow(payload.policy.refundWindowDays);
      }
      setMessage(starter === "blank" ? "Empty policy created — add the checks you want." : "Policy created — customize the rules below, then save.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create policy.");
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy() {
    if (!policy) return;
    if (rules.length === 0) {
      setMessage("Add at least one rule before saving.");
      return;
    }
    if (enabledCount === 0) {
      setMessage("Enable at least one rule before saving.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/policies/${policy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundWindowDays: refundWindow, rules }),
      });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save policy.");
      await refreshPolicy();
      setMessage("Policy saved. Refund decisions use these rules immediately.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save policy.");
    } finally {
      setBusy(false);
    }
  }

  function updateRule(index: number, patch: Partial<RefundPolicyRule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, i) => i !== index));
    setExpandedRule(null);
  }

  function addRule(code: RefundPolicyRuleCode) {
    const template = POLICY_RULE_TEMPLATE.find((rule) => rule.code === code);
    if (!template) return;
    setRules((current) => [...current, cloneRules([template])[0]!]);
    setExpandedRule(code);
  }

  function toggleCondition(reason: string, condition: string, index: number) {
    const rule = rules[index];
    if (!rule) return;
    const matrix = conditionConfig(rule);
    const current = matrix[reason as keyof typeof matrix] ?? [];
    const next = current.includes(condition as never)
      ? current.filter((entry) => entry !== condition)
      : [...current, condition as never];
    updateRule(index, {
      config: {
        ...rule.config,
        allowedConditionsByReason: { ...matrix, [reason]: next },
      },
    });
  }

  function renderRule(rule: RefundPolicyRule, index: number) {
    const isOpen = expandedRule === rule.code;
    return (
      <div key={`${rule.code}-${index}`} className={styles.ruleRow}>
        <div className={styles.ruleSummary}>
          <label className={styles.ruleToggle} onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(event) => updateRule(index, { enabled: event.target.checked })}
            />
          </label>
          <button type="button" className={styles.ruleSummaryMain} onClick={() => setExpandedRule(isOpen ? null : rule.code)}>
            <span className={styles.code}>{rule.code}</span>
            <span className={styles.ruleTitle}>{rule.title || RULE_LABELS[rule.code]}</span>
          </button>
          <button type="button" className={styles.ruleExpand} aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => setExpandedRule(isOpen ? null : rule.code)}>
            <ChevronDown size={16} className={clsx(styles.chevron, isOpen && styles.chevronOpen)} />
          </button>
        </div>
        {isOpen ? (
          <div className={styles.ruleBody}>
            <input className={styles.input} value={rule.title} onChange={(event) => updateRule(index, { title: event.target.value })} />
            <textarea className={styles.textarea} value={rule.text} onChange={(event) => updateRule(index, { text: event.target.value })} rows={2} />
            <button type="button" className={styles.linkButton} onClick={() => removeRule(index)}>Remove rule</button>
            {rule.code === "CONDITION_ALLOWED" ? (
              <div className={styles.matrix}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reason</th>
                      {ITEM_CONDITIONS.map((condition) => <th key={condition}>{condition}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {REFUND_REASONS.map((reason) => (
                      <tr key={reason}>
                        <td><code>{reason}</code></td>
                        {ITEM_CONDITIONS.map((condition) => {
                          const allowed = conditionConfig(rule)[reason] ?? [];
                          const checked = allowed.includes(condition);
                          return (
                            <td key={condition}>
                              <input type="checkbox" checked={checked} onChange={() => toggleCondition(reason, condition, index)} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (!policy) {
    return (
      <div className={styles.manager}>
        {message ? <div className={styles.notice}>{message}</div> : null}
        <section className={styles.main}>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>Create your refund policy</h2>
            <p className={styles.emptyText}>
              Pick a starting point below. Every rule can be turned off, removed, or edited — nothing is locked in.
            </p>
            <div className={styles.createOptions}>
              <button type="button" className={styles.button} disabled={busy} onClick={() => void createPolicy("recommended")}>
                Start with recommended checks
              </button>
              <p className={styles.optionHelp}>Common e-commerce refund rules (return window, delivered orders, item condition, etc.). Customize freely.</p>
              <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void createPolicy("blank")}>
                Build from scratch
              </button>
              <p className={styles.optionHelp}>Empty policy — you add only the rules you want.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.manager}>
      {message ? <div className={styles.notice}>{message}</div> : null}

      <div className={styles.topBar}>
        <div className={styles.statusLine}>
          <StatusBadge status="SUCCESS">Live</StatusBadge>
          <p className={styles.statusText}>
            <strong>{enabledCount}</strong> of {rules.length} checks enabled · {refundWindow}-day return window
          </p>
        </div>
        <button type="button" className={styles.button} disabled={busy} onClick={() => void savePolicy()}>
          Save policy
        </button>
      </div>

      <section className={styles.main}>
        <div className={styles.settingsRow}>
          <label className={styles.fieldLabel}>
            Return window (days after delivery)
            <input className={styles.input} type="number" min={1} max={365} value={refundWindow} onChange={(event) => setRefundWindow(Number(event.target.value))} />
          </label>
        </div>

        <div className={styles.rulesToolbar}>
          <span className={styles.rulesCount}>Refund checks — enabled rules are enforced on every support request</span>
          {availableRuleCodes.length > 0 ? (
            <select
              className={styles.select}
              style={{ maxWidth: 240 }}
              defaultValue=""
              onChange={(event) => {
                const code = event.target.value as RefundPolicyRuleCode;
                if (!code) return;
                addRule(code);
                event.target.value = "";
              }}
            >
              <option value="">Add check…</option>
              {availableRuleCodes.map((code) => <option key={code} value={code}>{RULE_LABELS[code]}</option>)}
            </select>
          ) : null}
        </div>

        <div className={styles.ruleList}>
          {rules.length === 0 ? (
            <div className={styles.emptyRules}>No rules yet. Use “Add check” to build your policy.</div>
          ) : (
            rules.map((rule, index) => renderRule(rule, index))
          )}
        </div>
      </section>
    </div>
  );
}
