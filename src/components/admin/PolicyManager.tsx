"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import {
  DEFAULT_CONDITION_ALLOWED,
  ITEM_CONDITIONS,
  REFUND_REASONS,
  mergePolicyRulesWithCatalog,
  type RefundPolicyRule,
  type RefundPolicyRuleCode,
} from "@/domain/refunds/policy";
import {
  POLICY_CATALOG,
  POLICY_RULE_CATEGORIES,
  catalogEntry,
  catalogRulesByCategory,
  type PolicyRuleCategory,
} from "@/domain/refunds/policy-catalog";
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

const RULE_LABELS = Object.fromEntries(
  POLICY_CATALOG.map((entry) => [entry.code, entry.title]),
) as Record<RefundPolicyRuleCode, string>;

const RULES_BY_CATEGORY = catalogRulesByCategory();

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

function initialRules(policy: PolicyRecord | null) {
  return cloneRules(mergePolicyRulesWithCatalog(policy?.rules ?? []));
}

export function PolicyManager({ initialPolicy }: PolicyManagerProps) {
  const [policy, setPolicy] = useState<PolicyRecord | null>(initialPolicy);
  const [rules, setRules] = useState<RefundPolicyRule[]>(() => initialRules(initialPolicy));
  const [refundWindow, setRefundWindow] = useState(initialPolicy?.refundWindowDays ?? 30);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canEditPolicy, setCanEditPolicy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/login", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { permissions?: unknown } | null) => {
        if (!active || !payload || !Array.isArray(payload.permissions)) return;
        setCanEditPolicy(payload.permissions.includes("policy:edit"));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const enabledCount = rules.filter((rule) => rule.enabled).length;

  async function refreshPolicy() {
    const response = await fetch("/api/admin/policies", { cache: "no-store" });
    const payload = await response.json() as { policy: PolicyRecord | null };
    setPolicy(payload.policy);
    if (payload.policy) {
      setRules(initialRules(payload.policy));
      setRefundWindow(payload.policy.refundWindowDays);
    }
  }

  async function createPolicy() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundWindowDays: 30 }),
      });
      const payload = await response.json() as { policy?: PolicyRecord; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to create policy.");
      setPolicy(payload.policy ?? null);
      if (payload.policy) {
        setRules(initialRules(payload.policy));
        setRefundWindow(payload.policy.refundWindowDays);
      }
      setMessage("Policy ready. Check the rules you want enforced, then save.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create policy.");
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy() {
    if (!policy) return;
    if (enabledCount === 0) {
      setMessage("Enable at least one check before saving.");
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
      setMessage("Policy saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save policy.");
    } finally {
      setBusy(false);
    }
  }

  function updateRule(index: number, patch: Partial<RefundPolicyRule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
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
      <div key={rule.code} className={styles.ruleRow}>
        <div className={styles.ruleSummary}>
          <label className={styles.ruleToggle} onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={rule.enabled}
              disabled={!canEditPolicy}
              onChange={(event) => updateRule(index, { enabled: event.target.checked })}
            />
          </label>
          <button type="button" className={styles.ruleSummaryMain} onClick={() => setExpandedRule(isOpen ? null : rule.code)}>
            <span className={styles.ruleTitle}>{rule.title || RULE_LABELS[rule.code] || catalogEntry(rule.code).title}</span>
            {!isOpen ? <span className={styles.rulePreview}>{rule.text}</span> : null}
          </button>
          <button type="button" className={styles.ruleExpand} aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => setExpandedRule(isOpen ? null : rule.code)}>
            <ChevronDown size={16} className={clsx(styles.chevron, isOpen && styles.chevronOpen)} />
          </button>
        </div>
        {isOpen ? (
          <div className={styles.ruleBody}>
            <p className={styles.ruleCode}><code>{rule.code}</code></p>
            <input className={styles.input} value={rule.title} disabled={!canEditPolicy} onChange={(event) => updateRule(index, { title: event.target.value })} />
            <textarea className={styles.textarea} value={rule.text} disabled={!canEditPolicy} onChange={(event) => updateRule(index, { text: event.target.value })} rows={2} />
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
                              <input type="checkbox" checked={checked} disabled={!canEditPolicy} onChange={() => toggleCondition(reason, condition, index)} />
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

  function renderCategory(category: PolicyRuleCategory) {
    return (
      <div key={category} className={styles.categoryGroup}>
        <h3 className={styles.categoryHeader}>{category}</h3>
        {RULES_BY_CATEGORY[category].map((entry) => {
          const index = rules.findIndex((rule) => rule.code === entry.code);
          const rule = rules[index];
          if (!rule) return null;
          return renderRule(rule, index);
        })}
      </div>
    );
  }

  if (!policy) {
    return (
      <div className={styles.manager}>
        {message ? <div className={styles.notice}>{message}</div> : null}
        <section className={styles.main}>
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>Set which refund checks NovaShop enforces. The support agent follows these rules exactly — it cannot approve refunds you disable here.</p>
            <button type="button" className={styles.button} disabled={busy || !canEditPolicy} onClick={() => void createPolicy()}>
              Create refund policy
            </button>
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
            <strong>{enabledCount}</strong>/{POLICY_CATALOG.length} enabled · {refundWindow}d window
          </p>
        </div>
        <button type="button" className={styles.button} disabled={busy || !canEditPolicy} onClick={() => void savePolicy()}>
          Save policy
        </button>
      </div>

      <section className={styles.main}>
        <div className={styles.settingsRow}>
          <label className={styles.fieldLabel}>
            Return window (days)
            <input className={styles.input} type="number" min={1} max={365} value={refundWindow} disabled={!canEditPolicy} onChange={(event) => setRefundWindow(Number(event.target.value))} />
          </label>
        </div>

        <div className={styles.rulesToolbar}>
          <span className={styles.rulesCount}>Checked = enforced on every refund request</span>
        </div>

        <div className={styles.ruleList}>
          {POLICY_RULE_CATEGORIES.map((category) => renderCategory(category))}
        </div>
      </section>
    </div>
  );
}
